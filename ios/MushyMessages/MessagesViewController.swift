import Messages
import UIKit
import WebKit

/// The bubble people tap. Linq sends an `imessage_app` card naming this
/// extension's bundle id and a URL; iMessage hands the URL to this view
/// controller, which shows the same /pay or /sign sheet the website serves.
/// Compact mode: one button. Expanded mode: the sheet itself.
final class MessagesViewController: MSMessagesAppViewController, WKNavigationDelegate {
    private let webView = WKWebView(frame: .zero, configuration: {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        return config
    }())
    private let openButton = UIButton(type: .system)
    private let siteURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "MUSHY_SITE_URL") as? String ?? "https://textbettingaimessage.vercel.app")!
    private var pendingURL: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)

        openButton.translatesAutoresizingMaskIntoConstraints = false
        openButton.setTitle("open", for: .normal)
        openButton.titleLabel?.font = .systemFont(ofSize: 20, weight: .semibold)
        openButton.addTarget(self, action: #selector(expand), for: .touchUpInside)
        view.addSubview(openButton)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            openButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            openButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    // MARK: - Conversation lifecycle

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        load(conversation.selectedMessage?.url)
        render(for: presentationStyle)
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        super.didSelect(message, conversation: conversation)
        load(message.url)
    }

    override func didTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        super.didTransition(to: presentationStyle)
        render(for: presentationStyle)
    }

    // MARK: - Helpers

    private func load(_ url: URL?) {
        // Only our own site, never an arbitrary URL from a message.
        guard let url, url.scheme == "https", url.host == siteURL.host else {
            pendingURL = siteURL
            webView.load(URLRequest(url: siteURL))
            return
        }
        pendingURL = url
        webView.load(URLRequest(url: url))
    }

    private func render(for style: MSMessagesAppPresentationStyle) {
        let compact = style == .compact
        openButton.isHidden = !compact
        webView.isHidden = compact
    }

    @objc private func expand() {
        requestPresentationStyle(.expanded)
    }

    /// Links out to Venmo / Cash App / PayPal leave the bubble and open the app.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        if url.host == siteURL.host || url.scheme == "about" { return decisionHandler(.allow) }
        extensionContext?.open(url, completionHandler: nil)
        decisionHandler(.cancel)
    }
}
