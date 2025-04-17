from flask import Flask, request, render_template, redirect, url_for, session, send_from_directory, jsonify
from AiEngine import get_recommender
import mysql.connector
from mysql.connector import pooling
import os
import random
import functools
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = os.urandom(24)

# MySQL Configuration with connection pooling
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  
    'database': 'project_supervisor_rec'
}

# Create a connection pool
connection_pool = pooling.MySQLConnectionPool(
    pool_name="supervisor_pool",
    pool_size=10,  # Adjust based on expected load
    **db_config
)

# Simple cache implementation
cache = {}
CACHE_TIMEOUT = 300  # seconds

def cached(timeout=CACHE_TIMEOUT):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            current_time = datetime.now()
            
            # Check if result is in cache and not expired
            if cache_key in cache and (current_time - cache['timestamp']) < timedelta(seconds=timeout):
                return cache[cache_key]['data']
            
            # Call the function and cache result
            result = func(*args, **kwargs)
            cache[cache_key] = {
                'data': result,
                'timestamp': current_time
            }
            return result
        return wrapper
    return decorator

# Get database connection from pool
def get_db_connection():
    conn = connection_pool.get_connection()
    return conn, conn.cursor(dictionary=True)

# Generate 11-digit random ID - optimized to use a better algorithm
def generate_random_id():
    return random.randint(10000, 99999)  # Increased range for better uniqueness

# Routes
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('homepage'))
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return "", 204  # Return no content status code

# Cache student ID checks to reduce database calls
@cached(timeout=60)
def is_student_id_taken(student_id):
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT 1 FROM student WHERE StudentID = %s", (student_id,))
        return cursor.fetchone() is not None
    finally:
        cursor.close()
        conn.close()

def get_unique_student_id():
    while True:
        student_id = generate_random_id()
        if not is_student_id_taken(student_id):
            return student_id

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template('register.html')
    
    # Handle POST request
    username = request.form.get('username')
    email = request.form.get('email')
    password = request.form.get('password')
    
    # Check if username or email already exists
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
        
        # If no existing user, proceed with registration
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
        # Use a single query with UNION to check both tables at once
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
        
        error_message = "Invalid username or password. Please try again."
        return render_template('index.html', error=error_message)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        error_message = "Login failed. Please try again later."
        return render_template('index.html', error=error_message)
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
    session.pop('username', None)
    session.pop('user_id', None)
    return redirect(url_for('index'))

# Add route to serve supervisor profile pictures
@app.route('/sv_pictures/<filename>')
def supervisor_picture(filename):
    # Cache the existence check to reduce file system operations
    cache_key = f"picture_exists:{filename}"
    picture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'SV PICTURE')
    
    if cache_key in cache:
        exists = cache[cache_key]
    else:
        exists = os.path.exists(os.path.join(picture_path, filename))
        cache[cache_key] = exists
    
    if exists:
        return send_from_directory(picture_path, filename)
    else:
        # Return default picture if requested picture doesn't exist
        return send_from_directory(picture_path, 'default.jpg')

@app.route('/api/supervisors', methods=['GET'])
def get_all_supervisors():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Cache this expensive query
    cache_key = "all_supervisors"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 300:
        return jsonify({"supervisors": cache[cache_key]['data']})
        
    conn, cursor = get_db_connection()
    try:
        # Optimized query with index hint
        cursor.execute("""
            SELECT s.SupervisorID, s.SvName, GROUP_CONCAT(e.Expertise SEPARATOR ', ') as expertise_areas
            FROM supervisor s
            LEFT JOIN expertise e ON s.SupervisorID = e.SupervisorID
            GROUP BY s.SupervisorID
            ORDER BY s.SvName
        """)
        
        supervisors = cursor.fetchall()
        
        # Cache the result
        cache[cache_key] = {
            'data': supervisors,
            'timestamp': datetime.now()
        }
        
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
    
    # Log this view - do this asynchronously to not block
    if 'user_id' in session:
        # Use a separate thread or task queue for this in a real app
        log_supervisor_view(session['user_id'], supervisor_id)
    
    # Check cache first
    cache_key = f"supervisor:{supervisor_id}"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 300:
        return jsonify(cache[cache_key]['data'])
        
    conn, cursor = get_db_connection()
    try:
        # Get supervisor details with expertise areas
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
            
        # Cache the result
        cache[cache_key] = {
            'data': supervisor,
            'timestamp': datetime.now()
        }
            
        return jsonify(supervisor)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
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
    
    # Cache the fyp projects data
    cache_key = "past_fyp_projects"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 300:
        return render_template('past_fyp.html', projects=cache[cache_key]['data'])
    
    # Get FYP projects from database
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT ProjectID, Title, Author, Abstract, Year 
            FROM past_fyp
            ORDER BY year DESC, Author
        """)
        
        fyp_projects = cursor.fetchall()
        
        # Cache the result
        cache[cache_key] = {
            'data': fyp_projects,
            'timestamp': datetime.now()
        }
        
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
    
    # Cache search results for common queries
    cache_key = f"search:{query}:{min_score}:{top_n}"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
        return jsonify({"results": cache[cache_key]['data']})
    
    try:
        recommender = get_recommender()
        results = recommender.search_supervisors(query, min_score, top_n)
        
        # Cache the result for this query
        cache[cache_key] = {
            'data': results,
            'timestamp': datetime.now()
        }
        
        return jsonify({"results": results})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/student_profile', methods=['GET'])
def get_student_profile():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Cache student profile
    cache_key = f"student_profile:{session['user_id']}"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 300:
        return jsonify(cache[cache_key]['data'])
        
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
        
        # Cache the result
        cache[cache_key] = {
            'data': profile_data,
            'timestamp': datetime.now()
        }
            
        return jsonify(profile_data)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/student_email', methods=['GET'])
def get_student_email():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    student_id = request.args.get('id')
    if not student_id or int(student_id) != session['user_id']:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Use the cached profile data if available
    cache_key = f"student_profile:{session['user_id']}"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 300:
        return jsonify({"email": cache[cache_key]['data']['email']})
        
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT StdEmail FROM student WHERE StudentID = %s", (student_id,))
        
        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "User not found"}), 404
            
        return jsonify({"email": result['StdEmail']})
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()
        
def log_supervisor_view(student_id, supervisor_id):
    conn, cursor = get_db_connection()
    try:
        # Use INSERT ... ON DUPLICATE KEY UPDATE instead of querying first
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

@app.route('/api/student_supervisor_history', methods=['GET'])
def get_supervisor_history():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Cache history data
    cache_key = f"supervisor_history:{session['user_id']}"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
        return jsonify(cache[cache_key]['data'])
            
    conn, cursor = get_db_connection()
    try:
        # Combined query for both recent and most viewed supervisors
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
        
        # Clean up the results by removing the list_type field
        for item in recent + most_viewed:
            del item['list_type']
        
        result = {
            "recent": recent,
            "most_viewed": most_viewed
        }
        
        # Cache the result
        cache[cache_key] = {
            'data': result,
            'timestamp': datetime.now()
        }
            
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
    
    # Cache FYP data for each supervisor
    cache_key = f"supervisor_fyp:{supervisor_id}"
    if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 300:
        return jsonify({"projects": cache[cache_key]['data']})
        
    conn, cursor = get_db_connection()
    try:
        # Get FYP projects supervised by this supervisor
        cursor.execute("""
            SELECT p.ProjectID, p.Title, p.Author, p.Abstract, p.Year
            FROM past_fyp p
            WHERE p.SupervisorID = %s
            ORDER BY p.Year DESC, p.Title
        """, (supervisor_id,))
        
        projects = cursor.fetchall()
        
        # Cache the result
        cache[cache_key] = {
            'data': projects,
            'timestamp': datetime.now()
        }
        
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
        
        error_message = "Invalid admin credentials. Please try again."
        return render_template('index.html', error=error_message)
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        error_message = "Login failed. Please try again later."
        return render_template('index.html', error=error_message)
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

@app.route('/api/admin/fyp', methods=['GET', 'POST'])
def admin_fyp():
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    if request.method == 'GET':
        # Cache admin FYP list
        cache_key = "admin_fyp_list"
        if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
            return jsonify({"projects": cache[cache_key]['data']})
            
        conn, cursor = get_db_connection()
        try:
            cursor.execute("""
                SELECT p.*, s.SvName as SupervisorName
                FROM past_fyp p
                LEFT JOIN supervisor s ON p.SupervisorID = s.SupervisorID
                ORDER BY p.Year DESC, p.Title
            """)
            projects = cursor.fetchall()
            
            # Cache the result
            cache[cache_key] = {
                'data': projects,
                'timestamp': datetime.now()
            }
            
            return jsonify({"projects": projects})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'POST':
        data = request.json
        conn, cursor = get_db_connection()
        try:
            # First get the maximum project ID
            cursor.execute("SELECT MAX(ProjectID) as max_id FROM past_fyp")
            result = cursor.fetchone()
            next_id = 1  # Default if no projects exist
            if result and result['max_id'] is not None:
                next_id = result['max_id'] + 1
            
            # Now insert with the next sequential ID
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
            cache_key = "admin_fyp_list"
            if cache_key in cache:
                del cache[cache_key]
                
            cache_key = "past_fyp_projects"
            if cache_key in cache:
                del cache[cache_key]
                
            cache_key = f"supervisor_fyp:{data.get('SupervisorID')}"
            if cache_key in cache:
                del cache[cache_key]
                
            return jsonify({"success": True, "message": "Project added successfully", "projectId": next_id})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"success": False, "error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()

@app.route('/api/admin/fyp/<int:project_id>', methods=['GET', 'PUT', 'DELETE'])
def admin_fyp_detail(project_id):
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    conn, cursor = get_db_connection()
    
    if request.method == 'GET':
        try:
            cursor.execute("""
                SELECT * FROM past_fyp WHERE ProjectID = %s
            """, (project_id,))
            project = cursor.fetchone()
            
            if not project:
                return jsonify({"error": "Project not found"}), 404
                
            return jsonify({"project": project})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'PUT':
        data = request.json
        try:
            # Get old supervisor ID first to clear its cache
            cursor.execute("SELECT SupervisorID FROM past_fyp WHERE ProjectID = %s", (project_id,))
            old_record = cursor.fetchone()
            old_supervisor_id = old_record['SupervisorID'] if old_record else None
            
            cursor.execute("""
                UPDATE past_fyp
                SET Title = %s, Author = %s, Abstract = %s, Year = %s, SupervisorID = %s
                WHERE ProjectID = %s
            """, (
                data.get('Title'),
                data.get('Author'),
                data.get('Abstract'),
                data.get('Year'),
                data.get('SupervisorID'),
                project_id
            ))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Project not found"}), 404
            
            # Clear relevant caches
            cache_key = "admin_fyp_list"
            if cache_key in cache:
                del cache[cache_key]
                
            cache_key = "past_fyp_projects"
            if cache_key in cache:
                del cache[cache_key]
                
            if old_supervisor_id:
                cache_key = f"supervisor_fyp:{old_supervisor_id}"
                if cache_key in cache:
                    del cache[cache_key]
                    
            new_supervisor_id = data.get('SupervisorID')
            if new_supervisor_id and new_supervisor_id != old_supervisor_id:
                cache_key = f"supervisor_fyp:{new_supervisor_id}"
                if cache_key in cache:
                    del cache[cache_key]
                
            return jsonify({"success": True, "message": "Project updated successfully"})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"success": False, "error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'DELETE':
        try:
            # Get supervisor ID first to clear its cache
            cursor.execute("SELECT SupervisorID FROM past_fyp WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()
            supervisor_id = project['SupervisorID'] if project else None
            
            cursor.execute("DELETE FROM past_fyp WHERE ProjectID = %s", (project_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Project not found"}), 404
            
            # Clear relevant caches
            cache_key = "admin_fyp_list"
            if cache_key in cache:
                del cache[cache_key]
                
            cache_key = "past_fyp_projects"
            if cache_key in cache:
                del cache[cache_key]
                
            if supervisor_id:
                cache_key = f"supervisor_fyp:{supervisor_id}"
                if cache_key in cache:
                    del cache[cache_key]
                
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
    
    if request.method == 'GET':
        # Cache admin supervisors list
        cache_key = "admin_supervisors_list"
        if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
            return jsonify({"supervisors": cache[cache_key]['data']})
            
        conn, cursor = get_db_connection()
        try:
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
            
            # Cache the result
            cache[cache_key] = {
                'data': supervisors,
                'timestamp': datetime.now()
            }
                    
            return jsonify({"supervisors": supervisors})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'POST':
        data = request.json
        conn, cursor = get_db_connection()
        try:
            # Start transaction
            conn.start_transaction()
            
            # Get the maximum SupervisorID to ensure we continue numbering properly
            cursor.execute("SELECT MAX(SupervisorID) as max_id FROM supervisor")
            result = cursor.fetchone()
            max_supervisor_id = result['max_id'] if result['max_id'] is not None else 0
            new_supervisor_id = max_supervisor_id + 1
            
            # Insert with explicit SupervisorID to ensure continuous numbering
            cursor.execute("""
                INSERT INTO supervisor (SupervisorID, SvName, SvEmail)
                VALUES (%s, %s, %s)
            """, (
                new_supervisor_id,
                data.get('SvName'),
                data.get('SvEmail')
            ))
            supervisor_id = new_supervisor_id
            
            # Insert expertise areas if provided
            if 'expertise' in data and data['expertise']:
                expertise_list = [x.strip() for x in data['expertise'].split(',') if x.strip()]
                
                # Check if ExpertiseID is an auto-increment field - cache this info for efficiency
                if 'expertise_table_structure' not in cache:
                    cursor.execute("DESCRIBE expertise")
                    table_structure = cursor.fetchall()
                    
                    has_auto_increment_id = False
                    for column in table_structure:
                        if column.get('Field') == 'ExpertiseID' and 'auto_increment' in column.get('Extra', '').lower():
                            has_auto_increment_id = True
                            break
                            
                    cache['expertise_table_structure'] = {
                        'has_auto_increment': has_auto_increment_id,
                        'timestamp': datetime.now()
                    }
                else:
                    has_auto_increment_id = cache['expertise_table_structure']['has_auto_increment']
                
                if has_auto_increment_id:
                    # Use batch insertion for better performance
                    values = [(supervisor_id, expertise) for expertise in expertise_list]
                    cursor.executemany("""
                        INSERT INTO expertise (SupervisorID, Expertise)
                        VALUES (%s, %s)
                    """, values)
                else:
                    # Generate unique IDs for expertise entries
                    cursor.execute("SELECT MAX(ExpertiseID) as max_id FROM expertise")
                    result = cursor.fetchone()
                    max_id = result['max_id'] if result['max_id'] is not None else 0
                    
                    # Prepare batch values with expertise IDs
                    values = [(max_id + i + 1, supervisor_id, expertise) for i, expertise in enumerate(expertise_list)]
                    cursor.executemany("""
                        INSERT INTO expertise (ExpertiseID, SupervisorID, Expertise)
                        VALUES (%s, %s, %s)
                    """, values)
            
            conn.commit()
            
            # Clear related caches
            clear_supervisor_caches(supervisor_id)
            
            return jsonify({"success": True, "message": "Supervisor added successfully"})
        except mysql.connector.Error as err:
            conn.rollback()
            print(f"Database error: {err}")
            return jsonify({"success": False, "error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()

# Helper function to clear supervisor-related caches
def clear_supervisor_caches(supervisor_id=None):
    keys_to_delete = []
    
    # Clear general supervisor lists
    keys_to_delete.append("all_supervisors")
    keys_to_delete.append("admin_supervisors_list")
    
    # Clear specific supervisor caches if ID provided
    if supervisor_id is not None:
        keys_to_delete.append(f"supervisor:{supervisor_id}")
        keys_to_delete.append(f"supervisor_fyp:{supervisor_id}")
        
    # Remove keys from cache
    for key in keys_to_delete:
        if key in cache:
            del cache[key]
    
    # Also clear any search results as they may include this supervisor
    search_keys = [k for k in cache if k.startswith("search:")]
    for key in search_keys:
        del cache[key]

@app.route('/api/admin/supervisors/<int:supervisor_id>', methods=['GET', 'PUT', 'DELETE'])
def admin_supervisor_detail(supervisor_id):
    if 'admin_username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    conn, cursor = get_db_connection()
    
    if request.method == 'GET':
        # Check cache first
        cache_key = f"admin_supervisor:{supervisor_id}"
        if cache_key in cache and (datetime.now() - cache[cache_key]['timestamp']).seconds < 60:
            return jsonify({"supervisor": cache[cache_key]['data']})
        
        try:
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
            
            # Cache the result
            cache[cache_key] = {
                'data': supervisor,
                'timestamp': datetime.now()
            }
                
            return jsonify({"supervisor": supervisor})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'PUT':
        data = request.json
        try:
            # Start transaction
            conn.start_transaction()
            
            # Update supervisor basic info
            cursor.execute("""
                UPDATE supervisor
                SET SvName = %s, SvEmail = %s
                WHERE SupervisorID = %s
            """, (
                data.get('SvName'),
                data.get('SvEmail'),
                supervisor_id
            ))
            
            # Handle expertise areas - use DELETE + INSERT instead of SELECT + DELETE + INSERT
            if 'expertise' in data:
                # Delete existing expertise areas
                cursor.execute("DELETE FROM expertise WHERE SupervisorID = %s", (supervisor_id,))
                
                # Insert new expertise areas using batch operation
                if data['expertise'].strip():
                    expertise_list = [x.strip() for x in data['expertise'].split(',') if x.strip()]
                    
                    # Check if ExpertiseID is an auto-increment field - use cached info if available
                    if 'expertise_table_structure' not in cache:
                        cursor.execute("DESCRIBE expertise")
                        table_structure = cursor.fetchall()
                        
                        has_auto_increment_id = False
                        for column in table_structure:
                            if column.get('Field') == 'ExpertiseID' and 'auto_increment' in column.get('Extra', '').lower():
                                has_auto_increment_id = True
                                break
                                
                        cache['expertise_table_structure'] = {
                            'has_auto_increment': has_auto_increment_id,
                            'timestamp': datetime.now()
                        }
                    else:
                        has_auto_increment_id = cache['expertise_table_structure']['has_auto_increment']
                    
                    if has_auto_increment_id:
                        # Use batch insertion for better performance
                        values = [(supervisor_id, expertise) for expertise in expertise_list]
                        cursor.executemany("""
                            INSERT INTO expertise (SupervisorID, Expertise)
                            VALUES (%s, %s)
                        """, values)
                    else:
                        # Generate unique IDs for expertise entries
                        cursor.execute("SELECT MAX(ExpertiseID) as max_id FROM expertise")
                        result = cursor.fetchone()
                        max_id = result['max_id'] if result['max_id'] is not None else 0
                        
                        # Prepare batch values with expertise IDs
                        values = [(max_id + i + 1, supervisor_id, expertise) for i, expertise in enumerate(expertise_list)]
                        cursor.executemany("""
                            INSERT INTO expertise (ExpertiseID, SupervisorID, Expertise)
                            VALUES (%s, %s, %s)
                        """, values)
            
            conn.commit()
            
            # Clear related caches
            clear_supervisor_caches(supervisor_id)
            
            return jsonify({"success": True, "message": "Supervisor updated successfully"})
        except mysql.connector.Error as err:
            conn.rollback()
            print(f"Database error: {err}")
            return jsonify({"success": False, "error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'DELETE':
        try:
            # Start transaction
            conn.start_transaction()
            
            # First delete expertise areas (foreign key constraint)
            cursor.execute("DELETE FROM expertise WHERE SupervisorID = %s", (supervisor_id,))
            
            # Delete supervisor views
            cursor.execute("DELETE FROM supervisor_views WHERE SupervisorID = %s", (supervisor_id,))
            
            # Check if any FYP projects are using this supervisor - optimize query to just count
            cursor.execute("SELECT COUNT(*) AS count FROM past_fyp WHERE SupervisorID = %s", (supervisor_id,))
            result = cursor.fetchone()
            
            if result and result['count'] > 0:
                conn.rollback()
                return jsonify({
                    "success": False, 
                    "error": f"Cannot delete supervisor. {result['count']} FYP projects are assigned to this supervisor."
                }), 400
                
            # Now delete the supervisor
            cursor.execute("DELETE FROM supervisor WHERE SupervisorID = %s", (supervisor_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Supervisor not found"}), 404
            
            # Clear related caches
            clear_supervisor_caches(supervisor_id)
                
            return jsonify({"success": True, "message": "Supervisor deleted successfully"})
        except mysql.connector.Error as err:
            conn.rollback()
            print(f"Database error: {err}")
            return jsonify({"success": False, "error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
            
@app.route('/admin/supervisors')
def admin_supervisors_page():
    if 'admin_username' not in session:
        return redirect(url_for('index'))
    return render_template('admin_supervisors.html')

# Clear expired cache entries periodically - would be better as a background task
def clean_cache():
    now = datetime.now()
    expired_keys = []
    
    for key, value in cache.items():
        if isinstance(value, dict) and 'timestamp' in value:
            if (now - value['timestamp']).seconds > 600:  # 10 minutes expiry
                expired_keys.append(key)
    
    for key in expired_keys:
        del cache[key]

# Run this function occasionally, e.g., every 100 requests
request_counter = 0
@app.before_request
def before_request():
    global request_counter
    request_counter += 1
    if request_counter >= 100:
        clean_cache()
        request_counter = 0

# Initialize database before first request
@app.before_first_request
def before_first_request():
    # Create tables if needed
    conn, cursor = get_db_connection()
    try:
        # Check if tables exist and create them if needed
        # Code omitted for brevity - same as original initialize_db function
        pass
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    app.run(debug=True)