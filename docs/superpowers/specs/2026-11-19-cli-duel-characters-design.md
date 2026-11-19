# CLI Duel characters and versus introduction

Approved by the owner: use the 15 supplied PNG files, names from filenames; both players may choose the same character. Implement locally, no commit/push or hosted changes.

Use supplied artwork with CSS transforms, not generated poses, new image assets or animation dependencies. A scrollable roster in each student's waiting arena offers preview and Confirm character. Store the confirmed allowlisted character ID on the match participant; choices may be replaced while waiting but lock at host Start. Host and opponent see choices and student names. Start requires two live eligible players with confirmed characters.

The five-second server countdown is followed by a synchronized two-second versus introduction, left/right character and student name below, character name secondary. Both browsers must stay present through introduction; commands and exam timer remain locked until both acknowledge the introduction end. A disconnect resets to waiting. Resume uses only the existing five-second countdown. Re-entry restores choice without restarting introduction. Gameplay uses small portraits beside HP, result popups use character artwork, and match history retains choices. Characters never alter scoring/HP. Reduced motion uses static artwork for equal duration.

Implementation choice: retain countdown status during introduction, add a versusEndsAt timestamp and characterSelectionRequired flag for new matches only. Preserve legacy matches. Server validation/lease authorization are authoritative. Images preload/decode before confirming, and failed images show a recoverable message. No private task is exposed before game start. Reuse centered modal/fullscreen stage and preserve mouse scrolling.
