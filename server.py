import json
import random
import uuid
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

# In-memory storage for rooms
# rooms = {
#    "12345": {
#        "host_id": "uuid",
#        "state": {},
#        "version": 1,
#        "actions": []
#    }
# }
rooms = {}

class RequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Disable logging to prevent console spam
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/status":
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
            return
            
        if parsed.path == "/room":
            room_id = qs.get("room_id", [None])[0]
            if not room_id or room_id not in rooms:
                self.send_response(404)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "Room not found"}')
                return
            
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = json.dumps({
                "state": rooms[room_id]["state"],
                "version": rooms[room_id]["version"]
            }).encode('utf-8')
            self.wfile.write(response)
            return

        # Serve static files logic (Optional, assuming user opens index.html locally)
        try:
            filename = parsed.path.lstrip('/')
            if not filename:
                filename = 'index.html'
            with open(filename, 'rb') as f:
                content = f.read()
            self.send_response(200)
            if filename.endswith('.css'): self.send_header('Content-Type', 'text/css')
            elif filename.endswith('.js'): self.send_header('Content-Type', 'application/javascript')
            else: self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(content)
        except Exception:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            data = json.loads(post_data)
        except:
            data = {}

        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        if parsed.path == "/create":
            room_id = str(random.randint(10000, 99999))
            host_id = str(uuid.uuid4())
            rooms[room_id] = {
                "host_id": host_id,
                "state": data.get("state", {}),
                "version": 1,
                "actions": []
            }
            res = json.dumps({"room_id": room_id, "client_id": host_id})
            self.wfile.write(res.encode('utf-8'))
            return

        if parsed.path == "/update":
            room_id = data.get("room_id")
            client_id = data.get("client_id")
            new_state = data.get("state")
            
            if room_id in rooms and rooms[room_id]["host_id"] == client_id:
                rooms[room_id]["state"] = new_state
                rooms[room_id]["version"] += 1
                self.wfile.write(b'{"success": true}')
            else:
                self.wfile.write(b'{"success": false, "error": "Not host or invalid room"}')
            return
            
        if parsed.path == "/action":
            # Client sends an action to be queued for the host
            room_id = data.get("room_id")
            action = data.get("action")
            if room_id in rooms:
                rooms[room_id]["actions"].append(action)
                self.wfile.write(b'{"success": true}')
            else:
                self.wfile.write(b'{"success": false, "error": "Invalid room"}')
            return

        if parsed.path == "/poll_actions":
            room_id = data.get("room_id")
            client_id = data.get("client_id")
            if room_id in rooms and rooms[room_id]["host_id"] == client_id:
                actions = rooms[room_id].get("actions", [])
                rooms[room_id]["actions"] = [] # Clear the queue after reading
                res = json.dumps({"actions": actions})
                self.wfile.write(res.encode('utf-8'))
            else:
                self.wfile.write(b'{"actions": []}')
            return

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    pass

if __name__ == '__main__':
    port = 8080
    server = ThreadedHTTPServer(('0.0.0.0', port), RequestHandler)
    print(f"--- DREAM DRAFT MULTIPLAYER SERVER ---")
    print(f"Server running on http://localhost:{port}")
    print(f"Listening for connections...")
    server.serve_forever()
