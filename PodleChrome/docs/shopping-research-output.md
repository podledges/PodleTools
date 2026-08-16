# Shopping research output

Shopping scouts should write captain-facing shopping reports to the Windows documents folder so they are easy to open in File Explorer.

Windows path:

```text
C:\Users\ayden\Documents\PodleShops
```

Linux/Nix path:

```text
/mnt/c/Users/ayden/Documents/PodleShops
```

A local convenience link may exist at:

```text
PodleChrome/PodleShops
```

That link is intentionally ignored by Git because it points to local Windows state.
Do not commit shopping reports, screenshots, receipts, account details, browser profiles, cookies, or other private local shopping state unless the captain explicitly asks for a specific file to be committed.

## Report format

Use one Markdown report per item or purchase decision.
Prefer filenames that are easy to scan, for example:

```text
NVIDIA-RTX-3090-30B-research.md
standing-desk-shortlist.md
router-upgrade-options.md
```

Each report should include:

- the purchase goal
- ranked recommendations
- prices and total cost when visible
- seller or platform credibility notes
- delivery, pickup, return, warranty, or buyer-protection notes
- links to listings or source pages
- risk rating and red flags
- a final recommendation and safe-buy checklist

For image-heavy research, create a sibling folder with the same base name and store screenshots there.
