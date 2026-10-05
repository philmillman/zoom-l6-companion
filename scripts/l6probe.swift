// L6 / L6max snapshot probe (macOS): locates snapshot bytes by diffing, without the browser.
// Talks to the mixer's "Editor" MIDI port via CoreMIDI.
//
// Usage: swift scripts/l6probe.swift steps.json > probe.jsonl
// steps.json: [{ "label": "...", "send": ["F0 52 00 00 31 0C 01 F7", ...], "snapshot": true }, ...]
// For every step: sends each message (waiting for its `00 <id>` ack), then if `snapshot` re-reads
// the state (identity request + editor open) and prints {"label","payload"} as one JSON line.
//
// Quit the official editor and close the app's editor link first (only one session may heartbeat).
// Only send verified `31 <id>` writes (see params.ts), never `45` SETs, and end with steps that
// restore every setting; check the last snapshot equals the first. The output is the format of
// src/midi/sysex/zoomL6/__tests__/fixtures/probe-l6-snapshot-diff.jsonl.
import CoreMIDI
import Foundation

func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02X", $0) }.joined(separator: " ") }
func parseHex(_ s: String) -> [UInt8] { s.split(separator: " ").compactMap { UInt8($0, radix: 16) } }
func name(_ e: MIDIEndpointRef) -> String {
  var cf: Unmanaged<CFString>?
  MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &cf)
  return (cf?.takeRetainedValue() as String?) ?? ""
}
func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

struct Step: Decodable { let label: String; let send: [String]; let snapshot: Bool }
let steps = try JSONDecoder().decode([Step].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))

// ── endpoints ────────────────────────────────────────────────────────────────
func findEndpoint(sources: Bool) -> MIDIEndpointRef? {
  let n = sources ? MIDIGetNumberOfSources() : MIDIGetNumberOfDestinations()
  var all: [String] = []
  for i in 0..<n {
    let e = sources ? MIDIGetSource(i) : MIDIGetDestination(i)
    let nm = name(e); all.append(nm)
    let l = nm.lowercased()
    if l.contains("editor") && (l.contains("l6") || l.contains("zoom")) { return e }
  }
  log("No Editor \(sources ? "source" : "destination") among: \(all)")
  return nil
}
guard let src = findEndpoint(sources: true), let dst = findEndpoint(sources: false) else { exit(2) }
log("Using source '\(name(src))', destination '\(name(dst))'")

// ── inbound SysEx reassembly ─────────────────────────────────────────────────
let lock = NSCondition()
var inbox: [[UInt8]] = []
var partial: [UInt8] = []

var client = MIDIClientRef()
MIDIClientCreateWithBlock("l6probe" as CFString, &client, nil)
var inPort = MIDIPortRef()
MIDIInputPortCreateWithBlock(client, "in" as CFString, &inPort) { list, _ in
  for packet in list.unsafeSequence() {
    let bytes = withUnsafeBytes(of: packet.pointee.data) { Array($0.prefix(Int(packet.pointee.length))) }
    lock.lock()
    for b in bytes {
      if b == 0xF0 { partial = [b] } else if !partial.isEmpty {
        partial.append(b)
        if b == 0xF7 { inbox.append(partial); partial = [] }
      }
    }
    lock.broadcast(); lock.unlock()
  }
}
MIDIPortConnectSource(inPort, src, nil)
var outPort = MIDIPortRef()
MIDIOutputPortCreate(client, "out" as CFString, &outPort)

func send(_ bytes: [UInt8]) {
  var buffer = [UInt8](repeating: 0, count: 1024)
  buffer.withUnsafeMutableBytes { raw in
    let list = raw.baseAddress!.assumingMemoryBound(to: MIDIPacketList.self)
    let pkt = MIDIPacketListInit(list)
    _ = MIDIPacketListAdd(list, 1024, pkt, 0, bytes.count, bytes)
    MIDISend(outPort, dst, list)
  }
}

/// Waits for the first inbound message matching `match` that arrived after `since` messages.
func waitFor(_ match: ([UInt8]) -> Bool, timeout: TimeInterval) -> [UInt8]? {
  let deadline = Date().addingTimeInterval(timeout)
  lock.lock(); defer { lock.unlock() }
  while true {
    if let i = inbox.firstIndex(where: match) { let m = inbox[i]; inbox.removeSubrange(0...i); return m }
    if !lock.wait(until: deadline) { return nil }
  }
}
func clearInbox() { lock.lock(); inbox.removeAll(); lock.unlock() }
func isZoom(_ m: [UInt8], _ cmd: UInt8) -> Bool { m.count > 5 && m[0] == 0xF0 && m[1] == 0x52 && m[2] == 0 && m[3] == 0 && m[4] == cmd }

func isIdentityReply(_ m: [UInt8]) -> Bool {
  if m.count < 5 { return false }
  return m[1] == 0x7E && m[3] == 0x06 && m[4] == 0x02
}

let HEARTBEAT: [UInt8] = [0xF0, 0x52, 0x00, 0x00, 0x31, 0x0B, 0xF7]
func heartbeat() { send(HEARTBEAT); _ = waitFor({ isZoom($0, 0x00) && $0[5] == 0x0B }, timeout: 0.5) }

func readSnapshot() -> [UInt8]? {
  clearInbox()
  send([0xF0, 0x7E, 0x00, 0x06, 0x01, 0xF7])
  guard waitFor(isIdentityReply, timeout: 2) != nil else { log("no identity reply"); return nil }
  send([0xF0, 0x52, 0x00, 0x00, 0x2B, 0xF7])
  guard let reply = waitFor({ isZoom($0, 0x2A) }, timeout: 2) else { log("no 2A reply"); return nil }
  return Array(reply[5..<(reply.count - 1)])   // payload: after the 2A opcode, before F7
}

// ── run ──────────────────────────────────────────────────────────────────────
guard readSnapshot() != nil else { log("Session open failed"); exit(3) }
heartbeat()
for step in steps {
  for msgHex in step.send {
    let msg = parseHex(msgHex)
    clearInbox()
    send(msg)
    if msg.count > 5 && msg[4] == 0x31 {
      let id = msg[5]
      if waitFor({ isZoom($0, 0x00) && $0[5] == id }, timeout: 1.5) == nil { log("[\(step.label)] no ack for \(msgHex)") }
    }
    Thread.sleep(forTimeInterval: 0.15)
    heartbeat()
  }
  if step.snapshot {
    Thread.sleep(forTimeInterval: 0.2)
    guard let payload = readSnapshot() else { log("[\(step.label)] snapshot failed"); continue }
    let line = try JSONSerialization.data(withJSONObject: ["label": step.label, "payload": hex(payload)])
    print(String(data: line, encoding: .utf8)!)
    fflush(stdout)
    heartbeat()
  }
}
log("done")
