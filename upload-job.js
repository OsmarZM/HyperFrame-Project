const fs = require("fs");
const http = require("http");

const file = fs.readFileSync("Modelos/fortatech-ecommerce-tour.html");
const config = JSON.stringify({width:1920,height:1080,fps:30,durationInFrames:900,concurrency:1,outputPath:"output/fortatech-comercial-2026.mp4"});
const boundary = "HFBoundary" + Date.now();
const CRLF = "\r\n";

let header = "";
header += "--" + boundary + CRLF;
header += 'Content-Disposition: form-data; name="config"' + CRLF + CRLF;
header += config + CRLF;
header += "--" + boundary + CRLF;
header += 'Content-Disposition: form-data; name="scene"; filename="fortatech-ecommerce-tour.html"' + CRLF;
header += "Content-Type: text/html" + CRLF + CRLF;
const footer = CRLF + "--" + boundary + "--" + CRLF;

const bodyBuf = Buffer.concat([Buffer.from(header, "utf8"), file, Buffer.from(footer, "utf8")]);

const opts = {
  hostname: "localhost", port: 3002, path: "/jobs", method: "POST",
  headers: {"Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": bodyBuf.length}
};
const req = http.request(opts, res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => { console.log("STATUS:", res.statusCode); console.log("BODY:", d); });
});
req.on("error", e => console.error("ERROR:", e.message));
req.write(bodyBuf);
req.end();
