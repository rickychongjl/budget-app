DRAFT — not legal advice; to be reviewed by Ricky (and ideally a lawyer) before publication.

# Tight Arse privacy policy

**Effective:** [EFFECTIVE DATE]

Tight Arse is a personal budgeting app that works in 30-day cycles. It runs on the web and can be installed on your phone's home screen. Android and iPhone apps are planned.

It is run by [OPERATOR LEGAL NAME] ([ABN IF ANY]), an individual in Queensland, Australia. "We", "us" and "our" mean that person. You can reach us at **support@tightarse.app**.

This policy explains what we collect, why, where it is kept, who else handles it, and what you can do about it.

## The short version

- You sign in with Google. We never see or store a password.
- We keep your email, your name, your time zone and the budget figures you type in.
- Your data is stored in Microsoft Azure's Australia East region (Sydney).
- No bank connections, no ads, no third-party analytics, and we don't sell your data.
- The only cookies are the ones needed to keep you signed in and to protect your account.
- You can export your data, and deleting your account deletes it straight away.

## The standard we follow

We follow the Australian Privacy Principles in the Privacy Act 1988 (Cth). A small business may be exempt from that Act. We follow these principles anyway, and this policy is written to meet them.

## What we collect

**From Google, when you sign in**

- Your Google account ID, which tells us which account is yours.
- Your name. We use it as your display name when your account is created. You can change it.
- Your email address. We refresh it each time you sign in.
- Whether Google has verified your email. We need it to be verified, but we don't store this.

Google may send other profile details as part of sign-in (such as your profile picture). We don't keep them. We don't keep any Google sign-in tokens either.

**From you, as you use the app**

- Your time zone. It decides what "today" is for your budget.
- Your budget: cycles and their start dates, categories (name, icon, colour, order), budget amounts, opening and closing balances.
- Your transactions: amount, date, category, and an optional note.
- When things were created or changed.

We also store your currency (Australian dollars) and the date your account was created.

Please don't put sensitive information in notes, such as health details or bank card numbers. A budget doesn't need them.

**Automatically, when you use the app**

- Our hosting records requests to the app for up to 30 days, to keep it running and fix faults. This includes the time, the page or function used, how long it took and whether it worked.
- Your IP address is used to work out an approximate location (city, state, country) and is then discarded. Only the approximate location is kept. Your IP address is also used briefly, in memory, to stop anyone sending too many requests. It is not stored by the app.
- These records do not include your email or your budget figures.

**What we don't collect**

- We don't connect to your bank or read your bank statements.
- We don't collect card or payment details. Payments, when Premium launches, are handled by Apple or Google.
- We don't use advertising or third-party analytics, and we don't track you across other websites or apps.

## Why we use it

- To sign you in and keep your account separate from everyone else's.
- To store your budget and show it back to you on your devices.
- To work out your current cycle in your time zone.
- To reply when you contact us, and to tell you about important changes to your account or these documents.
- To keep the app secure and working, and to fix problems.
- When Premium launches (planned): to know which plan you are on.

We don't use your data for marketing, and we don't sell or rent it to anyone.

## The demo account

The "Try the demo" button opens one shared demo account that anyone can use without signing in.

- **Anything you type in the demo can be seen by other visitors.** Don't enter real or personal information there.
- The demo is wiped and reset every night, and anything typed there is deleted.
- A demo session ends after four hours.

## On your device

So the app works with no signal, it keeps a copy of your budget on your device. This copy includes your budget figures, transactions and notes, and any changes you made offline that haven't been sent yet.

- **When you sign out**, the copy of your budget is removed from that device. Changes that haven't been sent yet are kept until you sign back in and they are sent, or until someone else signs in on that device, when they are deleted.
- **If you just close the app**, the copy stays so you can open it offline later.
- The device also remembers a few preferences that never leave it: light or dark theme, your favourite and last-used categories, your chart filter, and whether you dismissed the install hint. These stay after you sign out.

On a shared or borrowed device, sign out when you're done.

## Cookies

We only use cookies that are strictly necessary for the app to work. None are for advertising or analytics.

| Cookie | What it does | How long |
|---|---|---|
| `budget.session` | Keeps you signed in. Holds only your account number in the app, encrypted. | 30 days from your last visit (4 hours for the demo) |
| `budget.csrf` | Protects your account from forged requests. | Until you close the browser |
| `.AspNetCore.Correlation.*` and `.AspNetCore.OpenIdConnect.Nonce.*` | Protect the Google sign-in step. | Deleted when sign-in finishes; at most an hour |

Our network provider, Cloudflare, may set its own security cookie to tell people apart from automated attacks. [Ricky to confirm whether any Cloudflare cookie is set.]

## Where your data is stored

Your account and budget are stored in Microsoft Azure's **Australia East** region (Sydney). This includes the database, its backups, and our request records.

Data is encrypted while it travels between your device and us, and while it is stored.

## Who else handles your data

We use a few service providers. They handle your data only to provide their service to us.

| Provider | What they do | What they see |
|---|---|---|
| Microsoft (Azure) | Hosts the app, the database, backups and request records, in Australia East | Everything we store |
| Cloudflare | Sits in front of the app to protect it and deliver it quickly | Your requests as they pass through, including your IP address |
| Google | Lets you sign in with your Google account | That you signed in to Tight Arse |
| Apple (planned) | Sign in with Apple, and in-app purchases on iPhone | That you signed in; your purchases |
| Google Play (planned) | In-app purchases on Android | Your purchases |

Microsoft keeps your stored data in Australia. Cloudflare, Google and Apple are based in the United States and operate worldwide, so the information they see may be handled outside Australia, including in the United States. Each has its own privacy policy for the data it handles as part of your account with them.

We may also share information if the law requires it, for example under a court order.

## How long we keep it

- **While you have an account:** we keep your data so the app can show your history.
- **When you delete your account:** your account and every budget, category, cycle and transaction are deleted from the live database straight away. This cannot be undone.
- **Backups:** the database is backed up automatically so it can be restored to any moment in the last 7 days. Deleted data stays in these backups until they expire, normally within 7 days and at most about two weeks. If we ever restore a backup, we will delete again any account that was deleted after that backup was made.
- **Request records:** kept for 30 days, then deleted. They don't contain your email or budget figures.
- **Emails you send us:** kept as long as we need them to help you. [Ricky to confirm.]

## Your choices and rights

- **See and correct your data.** Everything you type is in the app, and you can edit it there. Change your display name and time zone in Settings. Your email comes from Google; change it there and we'll pick it up next time you sign in.
- **Export it.** In Settings you can download all your data as CSV files (they open in Excel or Google Sheets) and as one JSON file.
- **Delete it.** In Settings you can delete your account. You type a confirmation, and everything is deleted immediately. If you sign in again with the same Google account, you start with a new, empty account.
- **Ask us.** Email support@tightarse.app to ask what we hold about you, or for help with any of the above. We will reply within 30 days.

We don't charge for any of this.

## Security

- No passwords: Google handles sign-in.
- Your session cookie can't be read by scripts on the page and is only sent over a secure connection.
- Every account's data is kept separate from every other account's, and the app is tested so one user can't reach another's data.
- The database needs a password to access and is encrypted at rest.

No system is perfectly secure. If a breach affects your information and could cause you serious harm, we will tell you as soon as we can, and tell the Office of the Australian Information Commissioner where the law requires it.

## Age

You need to be 18 or older to create an account. [Open question for Ricky: see the build log.]

## If you live outside Australia

Tight Arse is run from Australia and is built for people in Australia: amounts are in Australian dollars. If you use it from another country, your data is stored in Australia and handled as this policy describes. The laws where you live may give you other rights. Email us and we will help where we can.

## Changes to this policy

If we change this policy, we will update the date at the top. If a change is significant, we will tell you in the app or by email before it takes effect.

## Questions and complaints

Email **support@tightarse.app**. We will reply within 30 days.

If you are not happy with our answer, you may be able to complain to the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.
