import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigate } from '@/lib/router';

type Section = { title: string; body: string[] };

const CONTENT: Record<string, { title: string; intro: string; sections: Section[] }> = {
  help: {
    title: 'Help & Support',
    intro: 'Find answers to common questions or contact the ShopSharp team.',
    sections: [
      { title: 'Buying on ShopSharp', body: ['Browse products and open a listing to see its details and seller information.', 'Use Chat Seller to ask questions before arranging a purchase. ShopSharp does not process or hold payment for marketplace deals.', 'Read our Buyer Protection and Safety Tips before meeting a seller or paying.'] },
      { title: 'Selling on ShopSharp', body: ['Create your shop from the Sell button, then add products from your seller dashboard.', 'Manage your shop name, description, photos, and account preferences from Profile → Settings.', 'For plan features and limits, see the Pricing page.'] },
      { title: 'Account access', body: ['If you cannot sign in, use the Forgot password link on the sign-in page and follow the reset link sent to your email.', 'Never share your password, one-time passcode, or NIN details with anyone claiming to be support.'] },
      { title: 'Contact support', body: ['Email support@shorpsharp@gmail.com and include the shop or product link plus a short description of the issue.', 'Do not email your password, payment card details, one-time passcodes, or NIN documents.'] },
    ],
  },
  verification: {
    title: 'Shop Verification',
    intro: 'The green tick means a shop\'s identity has been confirmed by the ShopSharp team.',
    sections: [
      { title: 'Free for every shop', body: ['Verification is completely free — whether you\'re on the Free plan or a paid plan, there is no charge and nothing to buy.'] },
      { title: 'How to apply', body: ['Open your vendor dashboard and tap "Apply for Verification".', 'Enter your 11-digit NIN number and upload a clear photo of your NIN slip.', 'Submit — only the ShopSharp team sees your details.'] },
      { title: 'What happens next', body: ['Our team reviews your NIN details, usually quickly.', 'You\'ll get a notification when your shop is approved — the green tick then appears on your shop and all your products.', 'If your application is declined, we\'ll tell you why and you can reapply anytime.'] },
      { title: 'Loyalty badges', body: ['Alongside verification, shops with a long track record earn automatic badges: VIP after 3 years on ShopSharp, and VVIP after 6 years. Nothing to pay or apply for. They appear automatically.'] },
    ],
  },
  'buyer-protection': {
    title: 'Buyer Protection',
    intro: 'Simple rules that keep every deal on ShopSharp safe.',
    sections: [
      { title: 'Know who you\'re buying from', body: ['Every seller on ShopSharp is a real shop with a name, location and rating — never an anonymous account.', 'Look for the green verified tick and VIP/VVIP badges as extra signs of a trusted shop.'] },
      { title: 'Chat in the app', body: ['Keep conversations inside ShopSharp messages. Chats in the app are linked to your order, so there\'s a record if anything goes wrong.'] },
      { title: 'Inspect before you pay', body: ['Meet in a safe, public place and inspect the item carefully before handing over money.', 'Never pay in advance for items you haven\'t seen.'] },
      { title: 'Something went wrong?', body: ['If a seller misbehaves, use "Report a Seller" and our team will review the shop. Repeat offenders are removed from the marketplace.'] },
    ],
  },
  'report-seller': {
    title: 'Report a Seller',
    intro: 'Seen something suspicious? Tell us and we\'ll investigate.',
    sections: [
      { title: 'When to report', body: ['A seller asks you to pay before you\'ve seen the item.', 'A listing looks fake or the photos don\'t match the product.', 'A seller moves the conversation outside ShopSharp and pressures you.', 'Anything that feels like a scam.'] },
      { title: 'How to report', body: ['Open the shop\'s page or the product page.', 'Take screenshots of the conversation or listing.', 'Send the details and screenshots to our support email below — include the shop name and product link.'] },
      { title: 'What we do', body: ['Every report is reviewed by the ShopSharp team.', 'Shops that break the rules lose their verification badge; serious offenders are removed entirely.'] },
    ],
  },
  'safety-tips': {
    title: 'Safety Tips',
    intro: 'A few habits that keep you safe on every deal.',
    sections: [
      { title: 'Meeting up', body: ['Meet in busy, public places — shopping malls, petrol stations or police station premises are good options.', 'Go during the day and bring a friend for expensive items.'] },
      { title: 'Paying', body: ['Inspect the item fully before you pay.', 'Avoid advance payments and be careful with "delivery-only" deals from unverified shops.'] },
      { title: 'Talking', body: ['Keep chats in the app — it protects both sides.', 'Never share your card details, bank PIN or OTP with anyone.'] },
      { title: 'Trusting', body: ['Verified shops and VIP/VVIP badges show a shop has history on the platform.', 'Check the shop\'s rating and read the product description carefully.'] },
    ],
  },
  about: {
    title: 'About ShopSharp',
    intro: 'Nigeria\'s marketplace of real, verified shops.',
    sections: [
      { title: 'Our idea', body: ['Marketplaces fail when buyers can\'t trust sellers. ShopSharp fixes that: every seller is a real shop with a name, location, rating and reputation — never an anonymous listing.'] },
      { title: 'Trust, built in', body: ['Admins verify shop identities with the NIN process, and shops with a long track record earn VIP and VVIP badges after 3 and 6 years.', 'Buyers chat directly with shops in the app, with no middlemen or escrow wahala.'] },
      { title: 'Made in Nigeria', body: ['From Lagos to Kano, ShopSharp connects real shops with real buyers across the country. Proudly made in Nigeria.'] },
    ],
  },
  pricing: {
    title: 'Pricing',
    intro: 'Simple monthly plans for your shop. Verification is always free.',
    sections: [
      { title: 'Plans', body: ['Free plan: up to 5 active products and buyer chats in the app.', 'Starter (₦5,000 per month): up to 30 products and 2 boosts per month for stronger placement.', 'Pro (₦12,000 per month): up to 100 products, 5 boosts for sponsored listings, stronger branding, and full listing analytics.'] },
      { title: 'What\'s always free', body: ['Shop verification with your NIN — free for every shop on every plan.', 'VIP (3+ years) and VVIP (6+ years) loyalty badges — earned automatically, never sold.'] },
      { title: 'Ready to upgrade?', body: ['Sign in, open your dashboard and tap "Upgrade Plan" to see the full plan cards and pay securely through Paystack.'] },
    ],
  },
  terms: {
    title: 'Terms of Use',
    intro: 'The rules for using ShopSharp.',
    sections: [
      { title: 'Your account', body: ['You must provide accurate details when signing up, and you\'re responsible for keeping your password safe.', 'Shops must belong to real sellers — impersonation gets your account removed.'] },
      { title: 'Listings', body: ['List only items you\'re allowed to sell. Prohibited goods (weapons, drugs, counterfeit items, etc.) are removed and the shop banned.', 'Product photos must show the actual item being sold.'] },
      { title: 'Deals', body: ['ShopSharp connects buyers and sellers but isn\'t party to the transaction itself.', 'Follow the Buyer Protection and Safety Tips guidance for every deal.'] },
      { title: 'Changes', body: ['We may update these terms from time to time. Continued use of ShopSharp means you accept the latest version.'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'What we collect and how we protect it.',
    sections: [
      { title: 'What we collect', body: ['Your account details (name, email, phone).', 'For verification: your NIN number and NIN slip photo, used only to confirm your identity.', 'Messages you send through chats in the app, and products you post or order.'] },
      { title: 'How it\'s used', body: ['Verification details are seen only by the ShopSharp review team and are never shown to buyers.', 'Your email is used for account notices and, if you subscribe, ShopSharp updates and offers. You can unsubscribe at any time.', 'We never sell your personal data.'] },
      { title: 'Your control', body: ['You can remove your products, clear your wishlist and delete conversations anytime.', 'Want your data fully removed? Contact our support email below and we\'ll delete your account data.'] },
    ],
  },
};

export default function InfoPage({ slug }: { slug: string }) {
  const page = CONTENT[slug];
  const [key, setKey] = useState(slug);

  useEffect(() => {
    setKey(slug);
    window.scrollTo(0, 0);
  }, [slug]);

  if (!page) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-bold text-ink-900 mb-2">Page not found</p>
        <button onClick={() => navigate({ name: 'home' })} className="mt-4 bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">
          Go home
        </button>
      </div>
    );
  }

  return (
    <div key={key} className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-3xl sm:text-4xl font-extrabold text-ink-900">{page.title}</h1>
      <p className="text-ink-500 mt-3 text-lg leading-relaxed">{page.intro}</p>

      <div className="mt-10 space-y-8">
        {page.sections.map((s) => (
          <section key={s.title} className="bg-white rounded-2xl border border-ink-100 p-6">
            <h2 className="text-xl font-extrabold text-ink-900 mb-3">{s.title}</h2>
            <ul className="space-y-2">
              {s.body.map((line, i) => (
                <li key={i} className="text-ink-600 leading-relaxed flex gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-2.5" />
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-sm text-ink-400 mt-10 text-center">
        Questions? Reach us at <a className="hover:text-brand-600" href="mailto:support@shorpsharp@gmail.com">support@shorpsharp@gmail.com</a>
      </p>
    </div>
  );
}
