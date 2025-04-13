from flask import Flask, request, render_template, redirect, url_for, session, send_from_directory, jsonify
import mysql.connector
import os
import random
from AiEngine import get_recommender

app = Flask(__name__)
app.secret_key = os.urandom(24)

# MySQL Configuration
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  
    'database': 'project_supervisor_rec'
}

# Database connection function
def get_db_connection():
    conn = mysql.connector.connect(**db_config)
    return conn, conn.cursor(dictionary=True)

# Generate 11-digit random ID
def generate_random_id():
    return random.randint(100, 999)

# Create table if it doesn't exist
def initialize_db():
    conn, cursor = get_db_connection()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS student (
        StudentID BIGINT PRIMARY KEY,
        StdName VARCHAR(100) UNIQUE NOT NULL,
        StdPassword VARCHAR(255) NOT NULL,
        StdEmail VARCHAR(100) UNIQUE NOT NULL
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS supervisor_views (
        StudentID INT(11) NOT NULL,
        SupervisorID INT(11) NOT NULL,
        view_count INT DEFAULT 1,
        last_viewed DATETIME,
        PRIMARY KEY (StudentID, SupervisorID),
        FOREIGN KEY (StudentID) REFERENCES student(StudentID),
        FOREIGN KEY (SupervisorID) REFERENCES supervisor(SupervisorID)
    )
    ''')    
    conn.commit()
    cursor.close()
    conn.close()

# Initialize database on app startup
@app.before_first_request
def before_first_request():
    initialize_db()

# Routes
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('homepage'))
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return "", 204  # Return no content status code

def get_unique_student_id():
    conn, cursor = get_db_connection()
    try:
        while True:
            student_id = generate_random_id()
            cursor.execute("SELECT StudentID FROM student WHERE StudentID = %s", (student_id,))
            if not cursor.fetchone():
                return student_id
    finally:
        cursor.close()
        conn.close()

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
    
    # First check if it's an admin login
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT * FROM admin WHERE AdName = %s", (username,))
        admin = cursor.fetchone()
        
        if admin and admin['AdPassword'] == password:
            session['admin_username'] = username
            session['admin_id'] = admin['AdminID']
            return redirect(url_for('admin_dashboard'))
        
        # If not admin, check if it's a student
        cursor.execute("SELECT * FROM student WHERE StdName = %s", (username,))
        user = cursor.fetchone()
        
        if user and user['StdPassword'] == password:
            session['username'] = username
            session['user_id'] = user['StudentID']
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
    # Check if the requested file exists in SV PICTURE folder
    picture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'SV PICTURE')
    if os.path.exists(os.path.join(picture_path, filename)):
        return send_from_directory(picture_path, filename)
    else:
        # Return default picture if requested picture doesn't exist
        return send_from_directory(picture_path, 'default.jpg')

@app.route('/api/supervisors', methods=['GET'])
def get_all_supervisors():
    if 'username' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
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
    
    # Log this view
    if 'user_id' in session:
        log_supervisor_view(session['user_id'], supervisor_id)    
        
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
    
    # Get FYP projects from database
    conn, cursor = get_db_connection()
    try:
        cursor.execute("""
            SELECT ProjectID, Title, Author, Abstract, Year 
            FROM past_fyp
            ORDER BY year DESC, Author
        """)
        
        fyp_projects = cursor.fetchall()
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
    
    try:
        recommender = get_recommender()
        results = recommender.search_supervisors(query, min_score, top_n)
        return jsonify({"results": results})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/student_profile', methods=['GET'])
def get_student_profile():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT StudentID, StdName, StdEmail FROM student WHERE StudentID = %s", 
                     (session['user_id'],))
        
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        return jsonify({
            "id": user['StudentID'],
            "name": user['StdName'],
            "email": user['StdEmail']
        })
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
        # Check if view exists
        cursor.execute("""
            SELECT * FROM supervisor_views 
            WHERE StudentID = %s AND SupervisorID = %s
        """, (student_id, supervisor_id))
        
        existing = cursor.fetchone()
        
        if existing:
            # Update existing view count and timestamp
            cursor.execute("""
                UPDATE supervisor_views 
                SET view_count = view_count + 1, last_viewed = NOW() 
                WHERE StudentID = %s AND SupervisorID = %s
            """, (student_id, supervisor_id))
        else:
            # Insert new view
            cursor.execute("""
                INSERT INTO supervisor_views (StudentID, SupervisorID, view_count, last_viewed)
                VALUES (%s, %s, 1, NOW())
            """, (student_id, supervisor_id))
            
        conn.commit()
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
    finally:
        cursor.close()
        conn.close()

@app.route('/api/student_supervisor_history', methods=['GET'])
def get_supervisor_history():
    if 'username' not in session or 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
            
    conn, cursor = get_db_connection()
    try:
        # Get recently viewed supervisors
        cursor.execute("""
            SELECT sv.view_count, sv.last_viewed, s.SupervisorID, s.SvName 
            FROM supervisor_views sv
            JOIN supervisor s ON sv.SupervisorID = s.SupervisorID
            WHERE sv.StudentID = %s
            ORDER BY sv.last_viewed DESC
            LIMIT 5
        """, (session['user_id'],))
            
        recent = cursor.fetchall()
            
        # Get most viewed supervisors
        cursor.execute("""
            SELECT sv.view_count, sv.last_viewed, s.SupervisorID, s.SvName 
            FROM supervisor_views sv
            JOIN supervisor s ON sv.SupervisorID = s.SupervisorID
            WHERE sv.StudentID = %s
            ORDER BY sv.view_count DESC, sv.last_viewed DESC
            LIMIT 5
        """, (session['user_id'],))
            
        most_viewed = cursor.fetchall()
            
        return jsonify({
            "recent": recent,
            "most_viewed": most_viewed
        })
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
        conn, cursor = get_db_connection()
        try:
            cursor.execute("""
                SELECT p.*, s.SvName as SupervisorName
                FROM past_fyp p
                LEFT JOIN supervisor s ON p.SupervisorID = s.SupervisorID
                ORDER BY p.Year DESC, p.Title
            """)
            projects = cursor.fetchall()
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
                
            return jsonify({"success": True, "message": "Project updated successfully"})
        except mysql.connector.Error as err:
            print(f"Database error: {err}")
            return jsonify({"success": False, "error": str(err)}), 500
        finally:
            cursor.close()
            conn.close()
    
    elif request.method == 'DELETE':
        try:
            cursor.execute("DELETE FROM past_fyp WHERE ProjectID = %s", (project_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Project not found"}), 404
                
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
                
                # Get the structure of the expertise table to understand its primary key
                cursor.execute("DESCRIBE expertise")
                table_structure = cursor.fetchall()
                print("Expertise table structure:", table_structure)
                
                # Check if ExpertiseID is an auto-increment field
                has_auto_increment_id = False
                for column in table_structure:
                    if column.get('Field') == 'ExpertiseID' and 'auto_increment' in column.get('Extra', '').lower():
                        has_auto_increment_id = True
                        break
                
                if has_auto_increment_id:
                    # If table has auto-increment primary key, don't specify it
                    for expertise in expertise_list:
                        cursor.execute("""
                            INSERT INTO expertise (SupervisorID, Expertise)
                            VALUES (%s, %s)
                        """, (supervisor_id, expertise))
                else:
                    # Generate unique IDs for expertise entries
                    # First get the maximum ExpertiseID
                    cursor.execute("SELECT MAX(ExpertiseID) as max_id FROM expertise")
                    result = cursor.fetchone()
                    max_id = result['max_id'] if result['max_id'] is not None else 0
                    
                    # Insert with explicit ExpertiseID 
                    for i, expertise in enumerate(expertise_list):
                        new_id = max_id + i + 1
                        cursor.execute("""
                            INSERT INTO expertise (ExpertiseID, SupervisorID, Expertise)
                            VALUES (%s, %s, %s)
                        """, (new_id, supervisor_id, expertise))
            
            conn.commit()
            return jsonify({"success": True, "message": "Supervisor added successfully"})
        except mysql.connector.Error as err:
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
    
    if request.method == 'GET':
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
            
            # Handle expertise areas
            if 'expertise' in data:
                # Delete existing expertise areas
                cursor.execute("DELETE FROM expertise WHERE SupervisorID = %s", (supervisor_id,))
                
                # Insert new expertise areas
                if data['expertise'].strip():
                    expertise_list = [x.strip() for x in data['expertise'].split(',') if x.strip()]
                    
                    # Get the structure of the expertise table
                    cursor.execute("DESCRIBE expertise")
                    table_structure = cursor.fetchall()
                    
                    # Check if ExpertiseID is an auto-increment field
                    has_auto_increment_id = False
                    for column in table_structure:
                        if column.get('Field') == 'ExpertiseID' and 'auto_increment' in column.get('Extra', '').lower():
                            has_auto_increment_id = True
                            break
                    
                    if has_auto_increment_id:
                        # If table has auto-increment primary key, don't specify it
                        for expertise in expertise_list:
                            cursor.execute("""
                                INSERT INTO expertise (SupervisorID, Expertise)
                                VALUES (%s, %s)
                            """, (supervisor_id, expertise))
                    else:
                        # Generate unique IDs for expertise entries
                        # First get the maximum ExpertiseID
                        cursor.execute("SELECT MAX(ExpertiseID) as max_id FROM expertise")
                        result = cursor.fetchone()
                        max_id = result['max_id'] if result['max_id'] is not None else 0
                        
                        # Insert with explicit ExpertiseID
                        for i, expertise in enumerate(expertise_list):
                            new_id = max_id + i + 1
                            cursor.execute("""
                                INSERT INTO expertise (ExpertiseID, SupervisorID, Expertise)
                                VALUES (%s, %s, %s)
                            """, (new_id, supervisor_id, expertise))
            
            conn.commit()
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
            
            # Check if any FYP projects are using this supervisor
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
    
if __name__ == '__main__':
    app.run(debug=True)