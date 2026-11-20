"""
SCANNER LAB: A TINY LOCAL WEB SERVER
The lab runs the real website scanner in the browser, and the browser needs two things from this computer:
  1. the test photos and the lab's own script (GET: it just hands over the files in the scanner-lab folder),
  2. a place to send the results back to (POST to /save/<file name>: it writes what it receives into cache/results/).
It only answers on this computer (127.0.0.1), and allows the scanner page (on localhost) to talk to it.
Run:  python scripts/scanner-lab/lab-server.py      (stop it with Ctrl+C, or close its window)
"""

import http.server
import os
import socketserver
import sys

# The folder this file is in (the scanner-lab folder): the files below it are what gets handed out
HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "cache", "results")
os.makedirs(RESULTS, exist_ok=True)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    # Serve files from the scanner-lab folder
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    # Every answer says "the scanner page may read this" (the page is on another port, so the browser asks first)
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # The browser's "may I send this?" question: yes
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    # The browser sending a result: write it into the results folder (only plain file names, never a path)
    def do_POST(self):
        if not self.path.startswith("/save/"):
            self.send_response(404)
            self.end_headers()
            return
        name = os.path.basename(self.path[len("/save/"):])
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        with open(os.path.join(RESULTS, name), "wb") as out:
            out.write(body)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"saved")

    # Keep the window quiet
    def log_message(self, *args):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as server:
    server.serve_forever()
