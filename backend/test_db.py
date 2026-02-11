import unittest
import json
import os
import sqlite3
import shutil
from app import app, init_db, DB_FILE

class AuctionDBTestCase(unittest.TestCase):
    def setUp(self):
        # Use a test database
        self.test_db = 'test_auction.db'
        # Override the global DB_FILE in app context if possible, 
        # or just swap the file. simpler to point app to test db if refactored,
        # but since app.py hardcodes DB_FILE, we'll backup and restore or just rely on 'app.test_client()' 
        # mocking the db connection is cleaner but let's just use the logic
        
        # Actually, let's just test the endpoints using a separate DB file by modifying app.py? 
        # No, let's just use the app's db but clean it up or use a unique name.
        
        self.app = app.test_client()
        self.app.testing = True
        
    def test_create_and_get_tournament(self):
        payload = {
            'tournamentName': 'Unit Test Tournament',
            'teams': [],
            'totalPlayers': 100
        }
        
        # 1. Create
        response = self.app.post('/api/tournaments', 
                                 data=json.dumps(payload),
                                 content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('id', data)
        tournament_id = data['id']
        
        # 2. Get List
        response = self.app.get('/api/tournaments')
        self.assertEqual(response.status_code, 200)
        tournaments = json.loads(response.data)
        found = False
        for t in tournaments:
            if t['id'] == tournament_id:
                self.assertEqual(t['name'], 'Unit Test Tournament')
                found = True
                break
        self.assertTrue(found)
        
        # 3. Get Specific
        response = self.app.get(f'/api/tournaments/{tournament_id}')
        self.assertEqual(response.status_code, 200)
        t_data = json.loads(response.data)
        self.assertEqual(t_data['tournamentName'], 'Unit Test Tournament')
        self.assertEqual(t_data['id'], tournament_id)

        # 4. Update
        payload['id'] = tournament_id
        payload['tournamentName'] = 'Updated Name'
        response = self.app.post('/api/tournaments', 
                                 data=json.dumps(payload),
                                 content_type='application/json')
        self.assertEqual(response.status_code, 200)
        
        # Verify Update
        response = self.app.get(f'/api/tournaments/{tournament_id}')
        t_data = json.loads(response.data)
        self.assertEqual(t_data['tournamentName'], 'Updated Name')
        
    def tearDown(self):
        # Optional: cleanup test data
        pass

if __name__ == '__main__':
    unittest.main()
