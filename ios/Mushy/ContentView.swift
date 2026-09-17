import SwiftUI

struct ContentView: View {
    private let site = URL(string: Bundle.main.object(forInfoDictionaryKey: "MUSHY_SITE_URL") as? String ?? "https://textbettingaimessage.vercel.app")!

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text("mushy")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                Text("keeps score on bets in your group chat")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 10) {
                    step("1", "add the mushy number to a group chat")
                    step("2", "say \"hey mushy\" then the bet")
                    step("3", "everyone 👍 to lock it, proof goes in the thread")
                    step("4", "whoever's on the other side calls it")
                }
                .padding(.top, 8)
                Text("points, not money. when friends put real money on it, they pay each other through their own apps — mushy only keeps track.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
                Link("open mushy on the web", destination: site)
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
            }
            .padding(24)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func step(_ n: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(n)
                .font(.headline)
                .frame(width: 26, height: 26)
                .background(Color.primary.opacity(0.08), in: Circle())
            Text(text)
        }
    }
}
