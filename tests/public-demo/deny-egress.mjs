// CI only: flag attempts, not just successful connections. Never log destinations or data.
import net from "node:net";
net.Socket.prototype.connect = function () {
  process.stderr.write("PUBLIC_DEMO_UNEXPECTED_OUTBOUND\n");
  throw new Error("Outbound sockets are denied in this test.");
};
