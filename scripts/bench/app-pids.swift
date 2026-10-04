// Prints, one per line, <pid> and every process macOS holds it responsible for:
// its WebKit helpers ("<App> Web Content") and child processes. This is the same
// attribution Activity Monitor uses. Usage: app-pids <pid>
import Darwin
import Foundation

typealias ResponsibleFor = @convention(c) (pid_t) -> pid_t

guard CommandLine.arguments.count >= 2, let target = pid_t(CommandLine.arguments[1]) else {
  FileHandle.standardError.write("usage: app-pids <pid>\n".data(using: .utf8)!)
  exit(2)
}
let rtldDefault = UnsafeMutableRawPointer(bitPattern: -2)
guard let symbol = dlsym(rtldDefault, "responsibility_get_pid_responsible_for_pid") else {
  FileHandle.standardError.write("responsibility_get_pid_responsible_for_pid is not available\n".data(using: .utf8)!)
  exit(3)
}
let responsibleFor = unsafeBitCast(symbol, to: ResponsibleFor.self)

let capacity = Int(proc_listallpids(nil, 0)) + 256
var pids = [pid_t](repeating: 0, count: capacity)
let found = Int(proc_listallpids(&pids, Int32(capacity * MemoryLayout<pid_t>.size)))
for pid in pids.prefix(max(found, 0)) where pid > 0 {
  if pid == target || responsibleFor(pid) == target { print(pid) }
}
