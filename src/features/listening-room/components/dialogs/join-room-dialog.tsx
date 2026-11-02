"use client";
import { useController, useForm } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/shared/api/http-client";
import { OtpInput } from "@/shared/ui/otp-input";
import { FormField, FieldError } from "@/shared/ui/form-field";
import { roomRequest } from "../../api/room-client";
import { joinRoomSchema } from "../../model/form-schemas";
import type { RoomView } from "../../model/contracts";
import { RoomModal } from "./room-modal";
interface JoinRoomDialogProps {
  onClose: () => void;
  onRoomReady: (room: RoomView) => void;
  sessionBusy: boolean;
  initialJoinCode: string;
}
export function JoinRoomDialog({
  onClose,
  onRoomReady,
  sessionBusy,
  initialJoinCode,
}: JoinRoomDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: valibotResolver(joinRoomSchema),
    defaultValues: { code: initialJoinCode, person: "" },
    mode: "onTouched",
  });
  const { field } = useController({ name: "code", control });
  const busy = sessionBusy || isSubmitting;
  const join = handleSubmit(async ({ code, person }) => {
    try {
      const room = await roomRequest(`/api/rooms/${code}`, "POST", {
        name: person,
      });
      onRoomReady(room);
      onClose();
      toast.success("You’re in. Make yourself heard.");
    } catch (error) {
      setError("root.server", { message: errorMessage(error) });
    }
  });
  return (
    <RoomModal
      onClose={onClose}
      title="Join the listening room."
      description="Get the six-character code from your host and join the room."
    >
      <form noValidate onSubmit={join} className="form-stack" aria-busy={busy}>
        <FormField
          id="join-code"
          label="Room code"
          required
          error={errors.code?.message}
        >
          <OtpInput
            inputId="join-code"
            inputName={field.name}
            inputRef={field.ref}
            length={6}
            type="both"
            value={field.value.toUpperCase()}
            onChange={(value) => field.onChange(value.toUpperCase())}
            onBlur={field.onBlur}
            size="sm"
            disabled={busy}
            status={errors.code ? "error" : "idle"}
            className="room-code-input"
            aria-label="Room code"
            aria-required="true"
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? "join-code-error" : undefined}
          />
        </FormField>
        <FormField
          id="join-person"
          label="Your name"
          required
          error={errors.person?.message}
        >
          <input
            id="join-person"
            {...register("person")}
            placeholder="The name behind the good taste"
            autoComplete="given-name"
            aria-required="true"
            aria-invalid={!!errors.person}
            aria-describedby={errors.person ? "join-person-error" : undefined}
          />
        </FormField>
        <FieldError message={errors.root?.server?.message} />
        <button disabled={busy} className="button primary w-full" type="submit">
          {busy ? "Joining the room…" : "Join the room"}
          <ArrowRight size={17} />
        </button>
        <p className="text-xs text-center text-muted">
          No account. No download. Just good music.
        </p>
      </form>
    </RoomModal>
  );
}
