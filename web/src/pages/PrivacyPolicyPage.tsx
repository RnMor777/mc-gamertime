import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate } from "../lib/utils";

const LAST_UPDATED = "2026-09-07";

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-8">
      <div>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit mb-4"
        >
          <ChevronLeft size={16} /> Home
        </Link>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ShieldCheck size={24} className="text-primary" />
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated {formatDate(LAST_UPDATED)}
        </p>
      </div>

      <div className="prose prose-sm prose-invert max-w-none">
        <p>
          This instance of MC GamerTime is run by its own administrator. MC GamerTime is open-source
          software for tracking board game nights; the person or group operating this instance
          decides who gets an account and is responsible for the data it holds. This page describes
          what the software stores so you know what that responsibility covers.
        </p>

        <h2>What is stored</h2>
        <p>
          Accounts are created by an administrator, not via public sign-up. For each account the
          software stores:
        </p>
        <ul>
          <li>Your username, display name, and a bcrypt-hashed (never plaintext) password</li>
          <li>Your role (admin or normal), used to control access to features</li>
          <li>An optional profile avatar image, if you or an administrator upload one</li>
          <li>
            An optional email address, if an administrator sets one — used only to send
            password-reset links
          </li>
          <li>
            A <code>lastReadAt</code> timestamp recording when you last opened your notifications,
            so unread ones can be counted
          </li>
        </ul>
        <p>Content that members create is stored alongside the account that created it:</p>
        <ul>
          <li>Logged game results: who played, scores, winners, and dates</li>
          <li>Blog posts and game recommendations authored by administrators</li>
          <li>Emoji reactions and comments left on logged results</li>
          <li>Notifications generated for you by activity on the instance</li>
        </ul>

        <h2>Cookies</h2>
        <p>
          The software sets a single cookie, <code>token</code>, containing a signed session token.
          It is used only to keep you signed in — never for tracking or advertising — and is marked{" "}
          <code>HttpOnly</code> and <code>SameSite=Strict</code> so it cannot be read by scripts or
          sent to other sites. When the instance is served over HTTPS it is also marked{" "}
          <code>Secure</code>. It expires after 7 days.
        </p>

        <h2>Analytics and third parties</h2>
        <p>
          No analytics, advertising, or third-party tracking scripts are built into the software.
          Fonts are bundled with the application rather than loaded from an external CDN.
        </p>
        <ul>
          <li>
            <strong>BoardGameGeek (BGG):</strong> when an administrator searches for a game to add
            to the catalog, the server queries BGG's public API for catalog metadata. Only the
            search text or a BGG game id is sent — never your personal data. Game artwork imported
            from BGG is loaded by your browser from BGG's image servers.
          </li>
          <li>
            <strong>Images:</strong> avatars, blog images, and game images are uploaded to this
            instance's own storage and served through the application to signed-in users only.
          </li>
          <li>
            <strong>Hosting:</strong> where the instance and its data are physically hosted is
            decided by the administrator, not by the software.
          </li>
        </ul>

        <h2>Data retention and deletion</h2>
        <p>
          Data is kept for as long as your account exists. When an administrator deletes your
          account, your user record and avatar are removed. Game results you appear in must be
          deleted by an administrator before the account can be removed, and your reactions,
          comments, and notifications are stored under your username.
        </p>

        <h2>Your rights</h2>
        <p>
          The administrator of this instance is the data controller for the information listed
          above. To request a copy of your data, have something corrected, or have your account and
          associated data deleted, contact the administrator of this instance. Depending on where
          you and the administrator are located, you may also have statutory rights under local data
          protection law.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          This page describes the software as shipped. If it changes, the "last updated" date above
          will be updated. The administrator of this instance may publish additional terms that
          apply to how they operate it.
        </p>

        <h2>Contact</h2>
        <p>
          For questions about this policy or about how your data is handled, contact the
          administrator of this instance.
        </p>
      </div>
    </div>
  );
}
