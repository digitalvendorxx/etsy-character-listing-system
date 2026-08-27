# Repository Working Agreements

- Never commit credentials, Etsy tokens, browser profiles, buyer/order data, live listing IDs, or private character images.
- Keep shop-private configuration in `config/*.local.json` and character/gallery assets under `local-assets/`; both are ignored.
- Local commands (`validate`, `plan`, `render`, `package`) must perform zero Etsy writes.
- Etsy writes are limited to draft creation, require `--apply`, an exact shop ID, and a reviewed manifest hash.
- Do not add automatic activation or publishing. Final Etsy publication stays manual.
- Fail closed when the authenticated shop, character hash, layout version, catalog version, or reviewed manifest changes.
- Marketing claims must be explicitly approved for the new shop. Never transfer sales, rating, speed, or result claims from another shop.
