// Prints the epoch time in ms when <pid> first shows a normal on-screen window.
// Usage: first-window <pid> [timeout-seconds]. Exits 1 on timeout.
// Uses CGWindowList (window owner pid only), so it needs no extra permissions.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 2, let pid = Int(args[1]) else {
  FileHandle.standardError.write("usage: first-window <pid> [timeout-seconds]\n".data(using: .utf8)!)
  exit(2)
}
let timeout = args.count >= 3 ? (Double(args[2]) ?? 60) : 60
let deadline = Date().addingTimeInterval(timeout)

while Date() < deadline {
  let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
  if let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
    for w in windows {
      let owner = (w[kCGWindowOwnerPID as String] as? NSNumber)?.intValue
      let layer = (w[kCGWindowLayer as String] as? NSNumber)?.intValue
      let bounds = w[kCGWindowBounds as String] as? [String: Any]
      let width = (bounds?["Width"] as? NSNumber)?.doubleValue ?? 0
      if owner == pid && layer == 0 && width > 200 {
        print(Int64(Date().timeIntervalSince1970 * 1000))
        exit(0)
      }
    }
  }
  usleep(10_000)
}
exit(1)
