from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime

app = Flask(__name__)
# Enable CORS for all routes (allows requests from your HTML file)
CORS(app)

DB_FILE = 'auction.db'

def init_db():
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        # Create table if not exists
        c.execute('''
            CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                state TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Check if is_deleted column exists, if not add it
        try:
            c.execute('SELECT is_deleted FROM tournaments LIMIT 1')
        except sqlite3.OperationalError:
            print("Migrating DB: Adding is_deleted column")
            c.execute('ALTER TABLE tournaments ADD COLUMN is_deleted BOOLEAN DEFAULT 0')

        conn.commit()
        conn.close()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Database initialization error: {e}")

# Initialize DB on startup
init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/tournaments', methods=['GET'])
def list_tournaments():
    try:
        conn = get_db_connection()
        # Get list of tournaments (id, name, updated_at) where NOT deleted
        tournaments = conn.execute('SELECT id, name, updated_at FROM tournaments WHERE is_deleted = 0 ORDER BY updated_at DESC').fetchall()
        conn.close()
        
        return jsonify([dict(ix) for ix in tournaments])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tournaments', methods=['POST'])
def save_tournament():
    try:
        data = request.json
        name = data.get('tournamentName')
        if not name:
             # Fallback if name is inside the state object
             name = data.get('auctionData', {}).get('tournamentName', 'Untitled Tournament')

        state_json = json.dumps(data)
        
        # Check if we are updating an existing one (client should send ID if known)
        tournament_id = data.get('id') 
        
        conn = get_db_connection()
        if tournament_id:
            # Update existing
            conn.execute('UPDATE tournaments SET name = ?, state = ?, updated_at = CURRENT_TIMESTAMP, is_deleted = 0 WHERE id = ?',
                         (name, state_json, tournament_id))
            new_id = tournament_id
        else:
            # Create new
            cursor = conn.execute('INSERT INTO tournaments (name, state, is_deleted) VALUES (?, ?, 0)', (name, state_json))
            new_id = cursor.lastrowid
            
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Saved successfully', 'id': new_id})

    except Exception as e:
        print(f"Save error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tournaments/<int:tournament_id>', methods=['GET'])
def get_tournament(tournament_id):
    try:
        conn = get_db_connection()
        tournament = conn.execute('SELECT * FROM tournaments WHERE id = ?', (tournament_id,)).fetchone()
        conn.close()
        
        if tournament is None:
            return jsonify({'error': 'Tournament not found'}), 404
            
        if tournament['is_deleted']:
             return jsonify({'error': 'Tournament is deleted'}), 410 # Gone

        # Parse the JSON state string back to object
        state_data = json.loads(tournament['state'])
        # Inject the ID into the state so the client knows it for future updates
        state_data['id'] = tournament['id'] 
        
        return jsonify(state_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tournaments/<int:tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    try:
         conn = get_db_connection()
         # Soft Delete
         conn.execute('UPDATE tournaments SET is_deleted = 1 WHERE id = ?', (tournament_id,))
         conn.commit()
         conn.close()
         return jsonify({'message': 'Deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tournaments/<int:tournament_id>/restore', methods=['POST'])
def restore_tournament(tournament_id):
    try:
         conn = get_db_connection()
         # Restore
         conn.execute('UPDATE tournaments SET is_deleted = 0 WHERE id = ?', (tournament_id,))
         conn.commit()
         conn.close()
         return jsonify({'message': 'Restored successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Keep the original analyze route for backward compatibility / AI feature
@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        # Extract auctionData if wrapped (depends on how frontend calls it)
        # The original code expected payload directly. Let's support both.
        if 'auctionData' in data:
            data = data['auctionData']

        teams = data.get('teams', [])
        total_credits = data.get('totalCredits', 0)
        players_per_team = data.get('playersPerTeam', 0)
        base_price = data.get('basePrice', 0)
        
        results = []
        
        for team in teams:
            budget = team.get('budget', 0)
            players_count = len(team.get('players', []))
            
            # --- Analysis Logic (Mirrors JS) ---
            
            # Metric 1: Spending Rate
            spent_pct = (total_credits - budget) / total_credits if total_credits > 0 else 0
            
            # Metric 2: Fill Rate
            slots_pct = players_count / players_per_team if players_per_team > 0 else 0
            
            # Metric 3: Remaining Calculations
            remaining_slots = players_per_team - players_count
            avg_budget_per_slot = 0
            if remaining_slots > 0:
                avg_budget_per_slot = int(budget / remaining_slots)
            
            # Default Status
            status = {'label': 'Balanced', 'color': 'var(--text-secondary)', 'icon': '⚖️'}

            # Rule 1: Completion
            if remaining_slots == 0:
                status = {'label': 'Complete', 'color': '#10b981', 'icon': '✅'}
            
            # Rule 2: High Risk (Crucial)
            else:
                risk_threshold = (base_price * 1.5) if base_price > 0 else (total_credits / players_per_team) * 0.2
                
                if avg_budget_per_slot < risk_threshold:
                    status = {'label': 'High Risk', 'color': '#ef4444', 'icon': '⚠️'}
                    
                # Rule 3: Strategy (Relative Rates)
                else:
                    diff = spent_pct - slots_pct
                    
                    if diff > 0.20:
                         status = {'label': 'Aggressive', 'color': '#f59e0b', 'icon': '🔥'}
                    elif diff < -0.15:
                         status = {'label': 'Saver', 'color': '#3b82f6', 'icon': '💎'}
                    elif spent_pct < 0.2 and slots_pct > 0.4:
                         status = {'label': 'Smart Buy', 'color': '#10b981', 'icon': '🧠'}
            
            results.append({
                'status': status,
                'avgBudget': avg_budget_per_slot,
                'remainingSlots': remaining_slots
            })
            
        return jsonify({'results': results})

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("AI Analysis & Database Server running on http://localhost:5000")
    app.run(debug=True, port=5000)
