import unittest
import json
import sqlite3
import time
from app import app

class SoftDeleteTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        
    def test_soft_delete_and_restore(self):
        # 1. Create Tournament
        payload = {'tournamentName': 'To Be Deleted'}
        response = self.app.post('/api/tournaments', 
                                 data=json.dumps(payload),
                                 content_type='application/json')
        data = json.loads(response.data)
        t_id = data['id']
        
        # 2. Verify it exists
        response = self.app.get(f'/api/tournaments/{t_id}')
        self.assertEqual(response.status_code, 200)
        
        # 3. Delete (Soft)
        response = self.app.delete(f'/api/tournaments/{t_id}')
        self.assertEqual(response.status_code, 200)
        
        # 4. Verify gone from list
        response = self.app.get('/api/tournaments')
        tournaments = json.loads(response.data)
        ids = [t['id'] for t in tournaments]
        self.assertNotIn(t_id, ids)
        
        # 5. Verify 410 Gone or 404 on get
        response = self.app.get(f'/api/tournaments/{t_id}')
        self.assertEqual(response.status_code, 410)
        
        # 6. Restore
        response = self.app.post(f'/api/tournaments/{t_id}/restore')
        self.assertEqual(response.status_code, 200)
        
        # 7. Verify back in list
        response = self.app.get('/api/tournaments')
        tournaments = json.loads(response.data)
        ids = [t['id'] for t in tournaments]
        self.assertIn(t_id, ids)

if __name__ == '__main__':
    unittest.main()
