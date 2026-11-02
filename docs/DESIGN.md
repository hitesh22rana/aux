# Aux interface

The listening room answers one question first: what are we listening to, and what comes next? Discovery answers what to request; the people view shows who is contributing. Settings expose host controls only to the host; members see session information and their leave action.

The redesign follows [Taste Skill](https://github.com/Leonxlnx/taste-skill)'s app-screen workflow. The selected direction is True-black flat, seed 791076289. The no-sidebar shell gives the queue more width. Panels use a neutral lightness step without resting shadows. Inter is hosted locally under its included Open Font License.

Aux's visual signature is the current song's cover beside the group-authored queue. Playback progress uses a muted amber accent. Navigation and primary buttons remain neutral. Name-stable Blobatar faces identify people; cover art identifies songs.

The desktop canvas is capped at 1208px inside equal 22px gutters. At that width, the queue has 860px, the gutter 28px, and the player 320px. Tablet navigation folds into a menu. On phones, song rows keep voting and removal visible, controls use touch-sized targets, and the player follows the queue and request controls.

Artwork and track metadata come from the selected integration; handoff requests use member-provided labels and a neutral artwork placeholder. The redesign adds no audio streaming, invented playback state, cross-service matching, or new provider capabilities. Host-led handoff still requires explicit confirmation before dequeuing.

[Mastering TypeScript](https://github.com/SpillwaveSolutions/mastering-typescript-skill) informed the shared Valibot contracts, validated JSON boundaries, discriminated room actions, and checked array access. Runtime and dependency versions remain governed by the project manifest rather than the skills' older example versions.

## Review and validation

The initial interface audit reported nine failures, including tiny tracked labels, low contrast, decorative gradients, and button effects. The redesigned screen uses a 14px body and locally loaded Inter, with a 26px desktop title and 23px phone title. The production visual check on 2026-11-02 passed with zero failures at 1440px, 768px, and 390px. All six fold/full-page images were reviewed.

The remaining layout warning identifies the queue column beside the player rail. These are independent regions with different content lengths, not peer metric cards. They intentionally keep their own heights rather than stretching an empty panel. Queue ranks and clock padding are actual data; the floating dialog shadow and the permission message containing “unlock” are legitimate uses flagged by the source checker.

Rooms display actual members and requests. The initial screen invites people to create or join a room, with no fabricated queue or playback. Forms use inline validation; required labels carry a red asterisk and Artist stays unmarked. The single Room settings control stays accessible at every viewport size.

## Landing page

The home page follows Taste Skill’s split-stage direction, seed 650188940. The aux cable, the object behind the product name, becomes the visual invitation to contribute. A single generated editorial still life shows headphones, an amber record, and an aux cable. It is conceptual artwork, not a photograph of a sold product or a customer session. The locally hosted WebP is approximately 182 KB.

The desktop pairs a large two-line title with portrait artwork in a single-screen layout. On phones the image leads, followed by the title and create/resume actions. The brand keeps Inter, a near-black ground, and an amber accent. How Aux works sits beside Join a room in the header. Your sessions sits beside Create a room and opens the browser’s authorized memberships. The previous explanatory section has been removed; the two-line footer remains at the page bottom. Ordinary desktop and phone viewports fit without scrolling; small-height screens and zoom can expand naturally to preserve readable controls. The landing page has no room navigation or settings.

The initial audit measured a 26px desktop title, no images, and a 30% empty block. The revised page uses a 118px title at 1440px, a 64px phone title, and one dominant image. Desktop, tablet, and phone crops are reviewed in the browser. Motion uses a brief image settle, type entrances, control feedback, and section reveals; reduced-motion preferences keep everything static and readable.

The inspector’s four-picture floor is explicitly waived for this compact room-entry page: one original image supports the split-stage concept, while extra pictures would add no useful content. No stock footage is added. The limited-motion and no-footage warnings are accepted to keep room entry quick and avoid an autoplay distraction.

## Room entry and controls

Room invitations use a dedicated loading state before showing a room or returning to the home page. The room header contains navigation, room settings, and invitations; joining another room remains a landing-page action. The search area uses its explanatory sentence instead of the former all-caps playback label.

Room codes use the Rare UI `swamimalode07/rare-ui/otp-input` component, installed with the shadcn CLI. The shared primitive retains its slot transitions, keyboard handling, and paste support, with project-specific TypeScript guards, first-input refs for React Hook Form, error descriptions, read-only invite display, dark colors, and reduced-motion support. Motion features load lazily; the glyph renderer is separate from input behavior.

People show an accessible status dot for Active now or Away without a tab count. Compact horizontal cards place the avatar beside an ellipsized name, role and queued-song count; the main column fits up to three cards, with one column on narrow screens. Explicitly departed members remain in request attribution but leave the people view. The host action is labelled End session and leave so its effect on everyone is clear.

## Responsive codes and reduced chrome

Code entry and invitation display use six equal grid columns across their container. Slots have no fixed width or minimum width that can overflow a narrow dialog. Invite labels target only direct children, so typography rules cannot override the widget’s centered character layer. Caret alignment follows cell resizing. Host-only controls are absent from member settings; the redundant people-view invite action and Shared session label have been removed. Connector setup instructions remain in technical documentation instead of the room UI.

Settings and room notes do not advertise or impose a per-person song cap. The remaining queue-order explanation describes behavior without suggesting a personal request cap.

Input focus uses a softly faded amber border and low-opacity halo instead of a separated hard outline. Navigation reads Room, Discover music and People, with the theme toggle after Room settings. Notifications enter at the top. Share surfaces show remaining room hours and minutes.

Unavailable invitations return to the homepage and open a dismissible Room unavailable
dialog with Create a room and Join a room actions. The error does not take over the
landing hero. The room summary uses a shadcn-style overlapping Blobatar group with
up to three faces and a +N overflow badge instead of a membership sentence. The
Room is live label is omitted. Pastel presence dots sit beside names, with a filled
green online indicator and a hollow warm away indicator. The invite card places its
code and remaining time together in one compact metadata row.
