# Chrome Web Store listing (draft)

## Short description (132 chars max)

Save site cookie sessions as named profiles with groups; switch by restoring cookies. Optional Pro plan via your account backend for higher limits.

## Single purpose

Help users **save and switch website login sessions** on the same browser by storing cookie snapshots per profile, with optional grouping. The extension does one thing: **cookie-based session switching** for allowed sites.

## Justification for permissions

- **cookies:** Read and write cookies for URLs the user saves or switches to (after host permission).
- **storage:** Store profiles, groups, and cookie snapshots locally.
- **tabs:** Detect the current tab URL when saving a profile; optionally open the profile URL after switching.
- **optional_host_permissions (*://*/*):** Request access only when the user saves/switches on a site, or if they explicitly choose broad access in Options.

## Freemium / payment

Free tier limits the number of profiles. Pro unlock uses sign-in to your own server (configured when building the extension), payment flows your backend provides, and subscription status from that API. Comply with regional store policies for out-of-store payments.

## Screenshots suggestions

1. Popup: list of profiles with Switch / Delete.
2. Options: Groups + Account / upgrade + Host access explanation.
3. Permission prompt overlay (blur sensitive text).

## Reviewer notes

- Cookie data is **local only**; describe optional export in privacy policy.
- If offering “all URLs” pre-grant, explain clearly why and that it is optional.
