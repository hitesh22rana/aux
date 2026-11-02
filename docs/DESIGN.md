# Aux interface

The listening room answers one question first: what are we listening to, and what comes next? Discovery answers what to request; the people view shows who is contributing. Settings keep host permissions and room limits close to the actions they affect.

The redesign follows [Taste Skill](https://github.com/Leonxlnx/taste-skill)'s app-screen workflow. The selected direction is True-black flat, seed 791076289. The no-sidebar shell gives the queue more width. Panels use a neutral lightness step without resting shadows. Inter is hosted locally under its included Open Font License.

Aux's visual signature is the current song's cover beside the group-authored queue. Playback progress uses a muted amber accent. Navigation and primary buttons remain neutral. Colour on avatars identifies people; cover art identifies songs.

The desktop canvas is capped at 1208px inside equal 22px gutters. At that width, the queue has 860px, the gutter 28px, and the player 320px. Tablet navigation folds into a menu. On phones, song rows keep voting and removal visible, controls use touch-sized targets, and the player follows the queue and request controls.

Artwork and track metadata come from the selected integration; handoff requests use member-provided labels and a neutral artwork placeholder. The redesign adds no audio streaming, invented playback state, cross-service matching, or new provider capabilities. Host-led handoff still requires explicit confirmation before dequeuing.

[Mastering TypeScript](https://github.com/SpillwaveSolutions/mastering-typescript-skill) informed the shared Valibot contracts, validated JSON boundaries, discriminated room actions, and checked array access. Runtime and dependency versions remain governed by the project manifest rather than the skills' older example versions.

## Review and validation

The initial interface audit reported nine failures, including tiny tracked labels, low contrast, decorative gradients, and button effects. The redesigned screen uses a 14px body and locally loaded Inter, with a 26px desktop title and 23px phone title. The production visual check on 2026-11-02 passed with zero failures at 1440px, 768px, and 390px. All six fold/full-page images were reviewed.

The remaining layout warning identifies the queue column beside the player rail. These are independent regions with different content lengths, not peer metric cards. They intentionally keep their own heights rather than stretching an empty panel. Queue ranks and clock padding are actual data; the floating dialog shadow and the permission message containing “unlock” are legitimate uses flagged by the source checker.

Rooms display actual members and requests. The initial screen invites people to create or join a room, with no fabricated queue or playback. Forms use inline validation; required labels carry a red asterisk and Artist stays unmarked. The single Room settings control stays accessible at every viewport size.
