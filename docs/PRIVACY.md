# Privacy Policy (draft for Chrome Web Store)

**Last updated:** 2026-03-30

## Summary

This extension (“Multi-Account Switch” / Cookie Profiles) is designed to store **login-related cookie snapshots** and related metadata **locally on your device** so you can switch between saved sessions. **We (the developer) do not operate servers that receive your cookies** as part of normal extension use.

## Data collected by the developer

- **None by default.** The extension does not send your cookies, browsing history, or profile names to the developer’s servers for core functionality.
- **Account / subscription (optional):** If you sign in to **your own backend** (configured at build time), the extension sends **email, password, and Bearer tokens** only to that API origin you approved in the browser. Cookie snapshots are still not uploaded by this extension.

## Data stored locally

- **Cookie snapshots** and **entry URLs** you choose to save.
- **Profile names** and **group names** you enter.
- **Optional:** a list of **host permission patterns** you have granted (e.g. per-site or broad access), used only to explain what the browser has allowed.

You may **export** backups to a JSON file; that file contains cookie data and must be protected like any secret credential.

## Permissions

- **Cookies:** read and write cookies for origins you approve (via optional host permissions).
- **Storage:** persist profiles and settings on disk via `chrome.storage.local`.
- **Tabs:** read the active tab URL when saving a session; optionally navigate the active tab after switching.

## Third parties

- **Payment / subscription:** If you pay through channels exposed by your backend (e.g. WeChat / Alipay QR), payment is handled by those providers per their policies. The extension does not receive your payment card details.

## Contact

Add your support email or site URL before publishing.

## Changes

Update this document when you add network calls, accounts, analytics, or change data practices.
