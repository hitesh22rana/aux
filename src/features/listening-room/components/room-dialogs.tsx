"use client";
import type { RoomView, RoomAction } from "../model/contracts";
import { CreateRoomDialog } from "./dialogs/create-room-dialog";
import { JoinRoomDialog } from "./dialogs/join-room-dialog";
import { InviteRoomDialog } from "./dialogs/invite-room-dialog";
import { SettingsRoomDialog } from "./dialogs/settings-room-dialog";
import { AboutRoomDialog } from "./dialogs/about-room-dialog";
export type RoomDialog =
  "create" | "join" | "invite" | "settings" | "about" | null;
interface RoomDialogsProps {
  dialog: RoomDialog;
  onDialogChange: (dialog: RoomDialog) => void;
  initialJoinCode: string;
  room: RoomView;
  real: boolean;
  ready: boolean;
  isHost: boolean;
  live: boolean;
  manual: boolean;
  sessionBusy: boolean;
  onRoomReady: (room: RoomView) => void;
  onAction: (action: RoomAction) => Promise<void>;
  onLeave: () => Promise<boolean>;
}
export function RoomDialogs(props: RoomDialogsProps) {
  const onClose = () => props.onDialogChange(null);
  switch (props.dialog) {
    case "create":
      return (
        <CreateRoomDialog
          onClose={onClose}
          onRoomReady={props.onRoomReady}
          sessionBusy={props.sessionBusy}
        />
      );
    case "join":
      return (
        <JoinRoomDialog
          onClose={onClose}
          onRoomReady={props.onRoomReady}
          sessionBusy={props.sessionBusy}
          initialJoinCode={props.initialJoinCode}
        />
      );
    case "invite":
      return props.real && props.ready ? (
        <InviteRoomDialog onClose={onClose} room={props.room} />
      ) : null;
    case "settings":
      return (
        <SettingsRoomDialog
          onClose={onClose}
          room={props.room}
          isHost={props.isHost}
          live={props.live}
          manual={props.manual}
          busy={props.sessionBusy}
          onAction={props.onAction}
          onLeave={props.onLeave}
        />
      );
    case "about":
      return (
        <AboutRoomDialog
          onClose={onClose}
          onCreate={() => props.onDialogChange("create")}
        />
      );
    default:
      return null;
  }
}
