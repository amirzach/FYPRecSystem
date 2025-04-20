from flask import Flask, request, render_template, redirect, url_for, session, send_from_directory, jsonify
from AiEngine import get_recommender
import mysql.connector
import os
import random
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = os.urandom(24)

# MySQL Configuration
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  
    'database': 'project_supervisor_rec'
}

# Simple cache implementation
cache = {}
CACHE_TIMEOUT = 300  # seconds

# Get database connection
def get_db_connection():
    conn = mysql.connector.connect(**db_config)
    return conn, conn.cursor(dictionary=True)

# Generate random ID
def generate_random_id():
    return random.randint(10000, 99999)

# Check if student ID exists
def is_student_id_taken(student_id):
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT 1 FROM student WHERE StudentID = %s", (student_id,))
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        conn.close()

# Get unique student ID
def get_unique_student_id():
    while True:
        student_id = generate_random_id()
        if not is_student_id_taken(student_id):
            return student_id

# Basic Routes
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('homepage'))
    return render_template('index.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template('register.html')
    
    username = request.form.get('username')
    email = request.form.get('email')
    password = request.form.get('password')
    
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT StdName, StdEmail FROM student WHERE StdName = %s OR StdEmail = %s", 
                      (username, email))
        existing_user = cursor.fetchone()
        
        if existing_user:
            error_message = ""
            if existing_user['StdName'] == username:
                error_message = "Username already exists. Please choose a different username."
            elif existing_user['StdEmail'] == email:
                error_message = "Email already registered. Please use a different email."
            return render_template('register.html', error=error_message)
        
        student_id = get_unique_student_id()
        cursor.execute(
            "INSERT INTO student (StudentID, StdName, StdEmail, StdPassword) VALUES (%s, %s, %s, %s)",
            (student_id, username, email, password)
        )
        conn.commit()
        return redirect(url_for('index'))
    except mysql.connector.Error as err:
        print(f"MySQL Error: {err}")
        return render_template('register.html', error="Registration failed. Please try again.")
    finally:
        cursor.close()
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    password = request.form.get('password')
    
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT 'admin' as type, AdminID as id, AdName as name, AdPassword as password 
            FROM admin WHERE AdName = %s
            UNION
            SELECT 'student' as type, StudentID as id, StdName as name, StdPassword as password 
            FROM student WHERE StdName = %s
        """, (username, username))
        
        user = cursor.fetchone()
        
        if user and user['password'] == password:
            if user['type'] == 'admin':
                session['admin_username'] = user['name']
                session['admin_id'] = user['id']
                return redirect(url_for('admin_dashboard'))
            else:
                session['username'] = user['name']
                session['user_id'] = user['id']
                return redirect(url_for('homepage'))
        
        return render_template('index.html', error="Invalid username or password. Please try again.")
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return render_template('index.html', error="Login failed. Please try again later.")
    finally:
        cursor.close()
        conn.close()

@app.route('/homepage')
def homepage():
    if 'username' not in session:
        return redirect(url_for('index'))
    return render_template('homepage.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

# Helper function to check and get cached data
def get_cached_data(key, timeout=CACHE_TIMEOUT):
    if key in cache:
        timestamp = cache[key].get('timestamp')
        if timestamp and (datetime.now() - timestamp) < timedelta(seconds=timeout):
            return cache[key].get('data')
    return None

# Helper function to set cached data
def set_cached_data(key, data):
    cache[key] = {
        'data': data,
        'timestamp': datetime.now()
    }

# API Routes
@app.route('/supervisor_picture/<filename>')
def supervisor_picture(filename):
    picture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'SV PICTURE')
    
    if os.path.exists(os.path.join(picture_path, filename)):
        return send_from_directory(picture_path, filename)
    else:
        return send_from_directory(picture_path, 'default.jpg')

@app.route('/api/supervisors', methods=['GET'])
def get_all_supervisors():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    cache_key = "all_supervisors"
    cached_data = get_cached_data(cache_key)
    if cached_data:
        return jsonify({"supervisors": cached_data})
        
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT s.SupervisorID, s.SvName, GROUP_CONCAT(e.Expertise SEPARATOR ', ') as expertise_areas
            FROM supervisor s
            LEFT JOIN expertise e ON s.SupervisorID = e.SupervisorID
            GROUP BY s.SupervisorID
            ORDER BY s.SvName
        """)
        
        supervisors = cursor.fetchall()
        set_cached_data(cache_key, supervisors)
        
        return jsonify({"supervisors": supervisors})
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/supervisor_profile.html')
def supervisor_profile():
    if 'username' not in session:
        return redirect(url_for('index'))
    return render_template('supervisor_profile.html')

@app.route('/api/supervisor/<int:supervisor_id>', methods=['GET'])
def get_supervisor(supervisor_id):
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Log supervisor view
    if 'user_id' in session:
        log_supervisor_view(session['user_id'], supervisor_id)
    
    cache_key = f"supervisor:{supervisor_id}"
    cached_data = get_cached_data(cache_key)
    if cached_data:
        return jsonify(cached_data)
        
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT s.SupervisorID, s.SvName, s.SvEmail, GROUP_CONCAT(e.Expertise SEPARATOR ', ') as expertise_areas
            FROM supervisor s
            LEFT JOIN expertise e ON s.SupervisorID = e.SupervisorID
            WHERE s.SupervisorID = %s
            GROUP BY s.SupervisorID
        """, (supervisor_id,))
        
        supervisor = cursor.fetchone()
        if not supervisor:
            return jsonify({"error": "Supervisor not found"}), 404
            
        set_cached_data(cache_key, supervisor)
        return jsonify(supervisor)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

def log_supervisor_view(student_id, supervisor_id):
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            INSERT INTO supervisor_views (StudentID, SupervisorID, view_count, last_viewed)
            VALUES (%s, %s, 1, NOW())
            ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed = NOW()
        """, (student_id, supervisor_id))
            
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Database error in log_supervisor_view: {err}")
    finally:
        cursor.close()
        conn.close()

@app.route('/supervisor_list.html')
def supervisor_list():
    if 'username' not in session:
        return redirect(url_for('index'))
    return render_template('supervisor_list.html')

@app.route('/profiles.html')
def profiles():
    if 'username' not in session:
        return redirect(url_for('index'))
    return render_template('profiles.html')

@app.route('/past_fyp.html')
def past_fyp():
    if 'username' not in session:
        return redirect(url_for('index'))
    
    cache_key = "past_fyp_projects"
    cached_data = get_cached_data(cache_key)
    if cached_data:
        return render_template('past_fyp.html', projects=cached_data)
    
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT ProjectID, Title, Author, Abstract, Year 
            FROM past_fyp
            ORDER BY year DESC, Author
        """)
        
        fyp_projects = cursor.fetchall()
        set_cached_data(cache_key, fyp_projects)
        
        return render_template('past_fyp.html', projects=fyp_projects)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return render_template('past_fyp.html', error="Failed to load projects", projects=[])
    finally:
        cursor.close()
        conn.close()

@app.route('/api/search_supervisors', methods=['GET'])
def search_supervisors():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    query = request.args.get('query', '')
    min_score = float(request.args.get('min_score', 0.1))
    top_n = int(request.args.get('top_n', 5))
    
    cache_key = f"search:{query}:{min_score}:{top_n}"
    cached_data = get_cached_data(cache_key, timeout=60)
    if cached_data:
        return jsonify({"results": cached_data})
    
    try:
        recommender = get_recommender()
        results = recommender.search_supervisors(query, min_score, top_n)
        set_cached_data(cache_key, results)
        
        return jsonify({"results": results})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/student_profile', methods=['GET'])
def get_student_profile():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    cache_key = f"student_profile:{session['user_id']}"
    cached_data = get_cached_data(cache_key)
    if cached_data:
        return jsonify(cached_data)
        
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT StudentID, StdName, StdEmail FROM student WHERE StudentID = %s", 
                     (session['user_id'],))
        
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        profile_data = {
            "id": user['StudentID'],
            "name": user['StdName'],
            "email": user['StdEmail']
        }
        
        set_cached_data(cache_key, profile_data)
        return jsonify(profile_data)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/student_supervisor_history', methods=['GET'])
def get_supervisor_history():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    cache_key = f"supervisor_history:{session['user_id']}"
    cached_data = get_cached_data(cache_key, timeout=60)
    if cached_data:
        return jsonify(cached_data)
            
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            (SELECT sv.view_count, sv.last_viewed, s.SupervisorID, s.SvName, 'recent' as list_type 
            FROM supervisor_views sv
            JOIN supervisor s ON sv.SupervisorID = s.SupervisorID
            WHERE sv.StudentID = %s
            ORDER BY sv.last_viewed DESC
            LIMIT 5)
            UNION ALL
            (SELECT sv.view_count, sv.last_viewed, s.SupervisorID, s.SvName, 'most_viewed' as list_type
            FROM supervisor_views sv
            JOIN supervisor s ON sv.SupervisorID = s.SupervisorID
            WHERE sv.StudentID = %s
            ORDER BY sv.view_count DESC, sv.last_viewed DESC
            LIMIT 5)
        """, (session['user_id'], session['user_id']))
            
        all_results = cursor.fetchall()
        
        # Separate the results by list_type
        recent = [item for item in all_results if item['list_type'] == 'recent']
        most_viewed = [item for item in all_results if item['list_type'] == 'most_viewed']
        
        # Clean up the results
        for item in recent + most_viewed:
            del item['list_type']
        
        result = {
            "recent": recent,
            "most_viewed": most_viewed
        }
        
        set_cached_data(cache_key, result)
        return jsonify(result)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/supervisor_fyp/<int:supervisor_id>', methods=['GET'])
def get_supervisor_fyp(supervisor_id):
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    cache_key = f"supervisor_fyp:{supervisor_id}"
    cached_data = get_cached_data(cache_key)
    if cached_data:
        return jsonify({"projects": cached_data})
        
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT p.ProjectID, p.Title, p.Author, p.Abstract, p.Year
            FROM past_fyp p
            WHERE p.SupervisorID = %s
            ORDER BY p.Year DESC, p.Title
        """, (supervisor_id,))
        
        projects = cursor.fetchall()
        set_cached_data(cache_key, projects)
        
        return jsonify({"projects": projects})
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/admin/login', methods=['POST'])
def admin_login():
    username = request.form.get('username')
    password = request.form.get('password')
    
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT * FROM admin WHERE AdName = %s", (username,))
        admin = cursor.fetchone()
        
        if admin and admin['AdPassword'] == password:
            session['admin_username'] = username
            session['admin_id'] = admin['AdminID']
            return redirect(url_for('admin_dashboard'))
        
        return render_template('index.html', error="Invalid admin credentials. Please try again.")
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return render_template('index.html', error="Login failed. Please try again later.")
    finally:
        cursor.close()
        conn.close()

@app.route('/admin/dashboard')
def admin_dashboard():
    if 'admin_username' not in session:
        return redirect(url_for('index'))
    return render_template('admin_dashboard.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_username', None)
    session.pop('admin_id', None)
    return redirect(url_for('index'))

@app.route('/admin/supervisors')
def admin_supervisors_page():
    if 'admin_username' not in session:
        return redirect(url_for('index'))
    return render_template('admin_supervisors.html')

# Helper function to clear cache
def clear_cache(keys=None, patterns=None):
    if keys:
        for key in keys:
            cache.pop(key, None)
    
    if patterns:
        for pattern in patterns:
            matches = [k for k in cache if k.startswith(pattern)]
            for key in matches:
                cache.pop(key, None)

@app.route('/api/admin/fyp', methods=['GET', 'POST'])
def admin_fyp():
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    cache_key = "admin_fyp_list"
    conn, cursor = get_db_connection()
    
    try:
        if request.method == 'GET':
            if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
                return jsonify({"projects": cache[cache_key]['data']})
                
            cursor.execute("""
                SELECT p.*, s.SvName as SupervisorName
                FROM past_fyp p
                LEFT JOIN supervisor s ON p.SupervisorID = s.SupervisorID
                ORDER BY p.Year DESC, p.Title
            """)
            projects = cursor.fetchall()
            
            cache[cache_key] = {
                'data': projects,
                'timestamp': datetime.now()
            }
            
            return jsonify({"projects": projects})
        
        elif request.method == 'POST':
            data = request.json
            
            cursor.execute("SELECT MAX(ProjectID) as max_id FROM past_fyp")
            result = cursor.fetchone()
            next_id = 1 if not result or result['max_id'] is None else result['max_id'] + 1
            
            cursor.execute("""
                INSERT INTO past_fyp (ProjectID, Title, Author, Abstract, Year, SupervisorID)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                next_id,
                data.get('Title'),
                data.get('Author'),
                data.get('Abstract'),
                data.get('Year'),
                data.get('SupervisorID')
            ))
            conn.commit()
            
            # Clear relevant caches
            clear_cache(
                keys=["admin_fyp_list", "past_fyp_projects"],
                patterns=[f"supervisor_fyp:{data.get('SupervisorID')}"]
            )
            
            return jsonify({"success": True, "message": "Project added successfully", "projectId": next_id})
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/admin/fyp/<int:project_id>', methods=['GET', 'PUT', 'DELETE'])
def admin_fyp_detail(project_id):
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    conn, cursor = get_db_connection()
    
    try:
        if request.method == 'GET':
            cursor.execute("SELECT * FROM past_fyp WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()
            
            if not project:
                return jsonify({"error": "Project not found"}), 404
                
            return jsonify({"project": project})
        
        elif request.method == 'PUT':
            data = request.json
            
            # Get old supervisor ID to clear its cache
            cursor.execute("SELECT SupervisorID FROM past_fyp WHERE ProjectID = %s", (project_id,))
            old_record = cursor.fetchone()
            old_supervisor_id = old_record['SupervisorID'] if old_record else None
            new_supervisor_id = data.get('SupervisorID')
            
            cursor.execute("""
                UPDATE past_fyp
                SET Title = %s, Author = %s, Abstract = %s, Year = %s, SupervisorID = %s
                WHERE ProjectID = %s
            """, (
                data.get('Title'),
                data.get('Author'),
                data.get('Abstract'),
                data.get('Year'),
                new_supervisor_id,
                project_id
            ))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Project not found"}), 404
            
            # Clear caches
            cache_keys = ["admin_fyp_list", "past_fyp_projects"]
            patterns = []
            
            if old_supervisor_id:
                patterns.append(f"supervisor_fyp:{old_supervisor_id}")
            
            if new_supervisor_id and new_supervisor_id != old_supervisor_id:
                patterns.append(f"supervisor_fyp:{new_supervisor_id}")
            
            clear_cache(keys=cache_keys, patterns=patterns)
            
            return jsonify({"success": True, "message": "Project updated successfully"})
        
        elif request.method == 'DELETE':
            # Get supervisor ID to clear its cache
            cursor.execute("SELECT SupervisorID FROM past_fyp WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()
            supervisor_id = project['SupervisorID'] if project else None
            
            cursor.execute("DELETE FROM past_fyp WHERE ProjectID = %s", (project_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Project not found"}), 404
            
            # Clear caches
            cache_keys = ["admin_fyp_list", "past_fyp_projects"]
            patterns = []
            
            if supervisor_id:
                patterns.append(f"supervisor_fyp:{supervisor_id}")
            
            clear_cache(keys=cache_keys, patterns=patterns)
            
            return jsonify({"success": True, "message": "Project deleted successfully"})
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"success": False, "error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/admin/supervisors', methods=['GET', 'POST'])
def admin_supervisors():
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    cache_key = "admin_supervisors_list"
    conn, cursor = get_db_connection()
    
    try:
        if request.method == 'GET':
            if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
                return jsonify({"supervisors": cache[cache_key]['data']})
                
            cursor.execute("""
                SELECT s.SupervisorID, s.SvName, s.SvEmail, 
                       GROUP_CONCAT(DISTINCT e.Expertise SEPARATOR ', ') as expertise_areas
                FROM supervisor s
                LEFT JOIN expertise e ON s.SupervisorID = e.SupervisorID
                GROUP BY s.SupervisorID, s.SvName, s.SvEmail
                ORDER BY s.SvName
            """)
            supervisors = cursor.fetchall()
            
            # Ensure no null values for expertise
            for supervisor in supervisors:
                if supervisor['expertise_areas'] is None:
                    supervisor['expertise_areas'] = ''
            
            cache[cache_key] = {
                'data': supervisors,
                'timestamp': datetime.now()
            }
                    
            return jsonify({"supervisors": supervisors})
        
        elif request.method == 'POST':
            data = request.json
            
            # Start transaction
            conn.start_transaction()
            
            # Get new supervisor ID
            cursor.execute("SELECT MAX(SupervisorID) as max_id FROM supervisor")
            result = cursor.fetchone()
            new_supervisor_id = (result['max_id'] if result['max_id'] is not None else 0) + 1
            
            # Insert supervisor
            cursor.execute("""
                INSERT INTO supervisor (SupervisorID, SvName, SvEmail)
                VALUES (%s, %s, %s)
            """, (
                new_supervisor_id,
                data.get('SvName'),
                data.get('SvEmail')
            ))
            
            # Handle expertise areas
            if 'expertise' in data and data['expertise']:
                expertise_list = [x.strip() for x in data['expertise'].split(',') if x.strip()]
                
                # Check for auto-increment
                if 'expertise_table_info' not in cache:
                    cursor.execute("DESCRIBE expertise")
                    has_auto_increment = any('auto_increment' in col.get('Extra', '').lower() 
                                         for col in cursor.fetchall() 
                                         if col.get('Field') == 'ExpertiseID')
                    
                    cache['expertise_table_info'] = {
                        'has_auto_increment': has_auto_increment,
                        'timestamp': datetime.now()
                    }
                else:
                    has_auto_increment = cache['expertise_table_info']['has_auto_increment']
                
                if has_auto_increment:
                    # Batch insert with auto-increment
                    values = [(new_supervisor_id, expertise) for expertise in expertise_list]
                    cursor.executemany("""
                        INSERT INTO expertise (SupervisorID, Expertise)
                        VALUES (%s, %s)
                    """, values)
                else:
                    # Generate IDs manually
                    cursor.execute("SELECT MAX(ExpertiseID) as max_id FROM expertise")
                    max_id = cursor.fetchone()['max_id'] or 0
                    
                    values = [(max_id + i + 1, new_supervisor_id, expertise) 
                             for i, expertise in enumerate(expertise_list)]
                    cursor.executemany("""
                        INSERT INTO expertise (ExpertiseID, SupervisorID, Expertise)
                        VALUES (%s, %s, %s)
                    """, values)
            
            conn.commit()
            
            # Clear caches
            clear_cache(
                keys=["all_supervisors", "admin_supervisors_list"],
                patterns=[f"supervisor:{new_supervisor_id}", "search:"]
            )
            
            return jsonify({"success": True, "message": "Supervisor added successfully"})
    
    except mysql.connector.Error as err:
        if request.method == 'POST':
            conn.rollback()
        print(f"Database error: {err}")
        return jsonify({"success": False, "error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/admin/supervisors/<int:supervisor_id>', methods=['GET', 'PUT', 'DELETE'])
def admin_supervisor_detail(supervisor_id):
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    conn, cursor = get_db_connection()
    cache_key = f"admin_supervisor:{supervisor_id}"
    
    try:
        if request.method == 'GET':
            if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
                return jsonify({"supervisor": cache[cache_key]['data']})
            
            cursor.execute("""
                SELECT s.SupervisorID, s.SvName, s.SvEmail, 
                       GROUP_CONCAT(e.Expertise SEPARATOR ', ') as expertise_areas
                FROM supervisor s
                LEFT JOIN expertise e ON s.SupervisorID = e.SupervisorID
                WHERE s.SupervisorID = %s
                GROUP BY s.SupervisorID, s.SvName, s.SvEmail
            """, (supervisor_id,))
            supervisor = cursor.fetchone()
            
            if not supervisor:
                return jsonify({"error": "Supervisor not found"}), 404
            
            cache[cache_key] = {
                'data': supervisor,
                'timestamp': datetime.now()
            }
                
            return jsonify({"supervisor": supervisor})
        
        elif request.method == 'PUT':
            data = request.json
            
            # Start transaction
            conn.start_transaction()
            
            # Update supervisor info
            cursor.execute("""
                UPDATE supervisor
                SET SvName = %s, SvEmail = %s
                WHERE SupervisorID = %s
            """, (
                data.get('SvName'),
                data.get('SvEmail'),
                supervisor_id
            ))
            
            # Handle expertise areas
            if 'expertise' in data:
                # Delete existing expertise
                cursor.execute("DELETE FROM expertise WHERE SupervisorID = %s", (supervisor_id,))
                
                # Insert new expertise if provided
                if data['expertise'].strip():
                    expertise_list = [x.strip() for x in data['expertise'].split(',') if x.strip()]
                    
                    # Check for auto-increment (use cached info if available)
                    if 'expertise_table_info' not in cache:
                        cursor.execute("DESCRIBE expertise")
                        has_auto_increment = any('auto_increment' in col.get('Extra', '').lower() 
                                             for col in cursor.fetchall() 
                                             if col.get('Field') == 'ExpertiseID')
                        
                        cache['expertise_table_info'] = {
                            'has_auto_increment': has_auto_increment,
                            'timestamp': datetime.now()
                        }
                    else:
                        has_auto_increment = cache['expertise_table_info']['has_auto_increment']
                    
                    if has_auto_increment:
                        # Batch insert with auto-increment
                        values = [(supervisor_id, expertise) for expertise in expertise_list]
                        cursor.executemany("""
                            INSERT INTO expertise (SupervisorID, Expertise)
                            VALUES (%s, %s)
                        """, values)
                    else:
                        # Generate IDs manually
                        cursor.execute("SELECT MAX(ExpertiseID) as max_id FROM expertise")
                        max_id = cursor.fetchone()['max_id'] or 0
                        
                        values = [(max_id + i + 1, supervisor_id, expertise) 
                                 for i, expertise in enumerate(expertise_list)]
                        cursor.executemany("""
                            INSERT INTO expertise (ExpertiseID, SupervisorID, Expertise)
                            VALUES (%s, %s, %s)
                        """, values)
            
            conn.commit()
            
            # Clear caches
            clear_cache(
                keys=["all_supervisors", "admin_supervisors_list", cache_key],
                patterns=[f"supervisor:{supervisor_id}", f"supervisor_fyp:{supervisor_id}", "search:"]
            )
            
            return jsonify({"success": True, "message": "Supervisor updated successfully"})
        
        elif request.method == 'DELETE':
            # Start transaction
            conn.start_transaction()
            
            # Delete expertise areas (foreign key constraint)
            cursor.execute("DELETE FROM expertise WHERE SupervisorID = %s", (supervisor_id,))
            
            # Delete supervisor views
            cursor.execute("DELETE FROM supervisor_views WHERE SupervisorID = %s", (supervisor_id,))
            
            # Check if any FYP projects use this supervisor
            cursor.execute("SELECT COUNT(*) AS count FROM past_fyp WHERE SupervisorID = %s", (supervisor_id,))
            result = cursor.fetchone()
            
            if result and result['count'] > 0:
                conn.rollback()
                return jsonify({
                    "success": False, 
                    "error": f"Cannot delete supervisor. {result['count']} FYP projects are assigned to this supervisor."
                }), 400
                
            # Delete the supervisor
            cursor.execute("DELETE FROM supervisor WHERE SupervisorID = %s", (supervisor_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Supervisor not found"}), 404
            
            # Clear caches
            clear_cache(
                keys=["all_supervisors", "admin_supervisors_list", cache_key],
                patterns=[f"supervisor:{supervisor_id}", f"supervisor_fyp:{supervisor_id}", "search:"]
            )
                
            return jsonify({"success": True, "message": "Supervisor deleted successfully"})
    
    except mysql.connector.Error as err:
        if request.method in ['PUT', 'DELETE']:
            conn.rollback()
        print(f"Database error: {err}")
        return jsonify({"success": False, "error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

# Clean cache periodically (simplified)
@app.before_request
def before_request():
    # Clean expired cache entries every 100 requests
    global request_counter
    request_counter = getattr(app, 'request_counter', 0) + 1
    setattr(app, 'request_counter', request_counter)
    
    if request_counter >= 100:
        now = datetime.now()
        expired_keys = [key for key, value in cache.items() 
                      if isinstance(value, dict) and 'timestamp' in value 
                      and (now - value['timestamp']).seconds > 600]
        
        for key in expired_keys:
            cache.pop(key, None)
            
        setattr(app, 'request_counter', 0)

if __name__ == '__main__':
    app.run(debug=True)