"use client";
import { useForm, useWatch } from "react-hook-form";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { ArrowRight, Check, Headphones } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/shared/api/http-client";
import { FormField, FieldError } from "@/shared/ui/form-field";
import { roomRequest } from "../../api/room-client";
import { providers, providerDefinition } from "../../model/providers";
import {
  createRoomSchema,
  type CreateRoomValues,
} from "../../model/form-schemas";
import type { RoomView } from "../../model/contracts";
import { ProviderMark } from "../music-art";
import { RoomModal } from "./room-modal";
interface CreateRoomDialogProps {
  onClose: () => void;
  onRoomReady: (room: RoomView) => void;
  sessionBusy: boolean;
}
export function CreateRoomDialog({
  onClose,
  onRoomReady,
  sessionBusy,
}: CreateRoomDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateRoomValues>({
    resolver: valibotResolver(createRoomSchema),
    defaultValues: {
      person: "",
      name: "The listening room",
      provider: "Spotify",
    },
    mode: "onTouched",
  });
  const provider = useWatch({ control, name: "provider" });
  const busy = sessionBusy || isSubmitting;
  const create = handleSubmit(async (values) => {
    try {
      const room = await roomRequest("/api/rooms", "POST", values);
      onRoomReady(room);
      onClose();
      toast.success("Your room is ready. Invite your people.");
    } catch (error) {
      setError("root.server", { message: errorMessage(error) });
    }
  });
  return (
    <RoomModal
      onClose={onClose}
      title="Start a listening room."
      description="Create a room, share the link, and let everyone take turns."
    >
      <form
        noValidate
        onSubmit={create}
        className="form-stack"
        aria-busy={busy}
      >
        <FormField
          id="create-person"
          label="Your name"
          required
          error={errors.person?.message}
        >
          <input
            id="create-person"
            {...register("person")}
            autoComplete="given-name"
            placeholder="What should we call you?"
            aria-required="true"
            aria-invalid={!!errors.person}
            aria-describedby={errors.person ? "create-person-error" : undefined}
          />
        </FormField>
        <FormField
          id="create-name"
          label="Give your room a name"
          required
          error={errors.name?.message}
        >
          <input
            id="create-name"
            {...register("name")}
            placeholder="The listening room"
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "create-name-error" : undefined}
          />
        </FormField>
        <fieldset>
          <legend>
            Choose the host’s music app{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="provider-options">
            {providers.map((p) => (
              <label className={provider === p ? "chosen" : ""} key={p}>
                <input
                  type="radio"
                  {...register("provider")}
                  aria-label={p}
                  aria-describedby={`provider-${providerDefinition(p).id}-capability`}
                  value={p}
                />
                <ProviderMark provider={p} />
                <span>
                  {p}
                  <small
                    id={`provider-${providerDefinition(p).id}-capability`}
                    className="provider-capability"
                  >
                    {providerDefinition(p).control === "remote"
                      ? "Automatic control"
                      : "Host-led handoff"}
                  </small>
                </span>
                {provider === p && <Check size={15} />}
              </label>
            ))}
          </div>
          <FieldError message={errors.provider?.message} />
        </fieldset>
        <div className="form-note">
          <Headphones size={16} />
          <span>{providerDefinition(provider).description}</span>
        </div>
        <FieldError message={errors.root?.server?.message} />
        <button disabled={busy} className="button primary w-full" type="submit">
          {busy ? "Creating your room…" : "Create room"}
          <ArrowRight size={17} />
        </button>
      </form>
    </RoomModal>
  );
}
