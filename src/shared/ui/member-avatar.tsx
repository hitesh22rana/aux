import { Blobatar } from "@blobatar/react";

/** The normalized display name is the seed, shared across rooms and surfaces. */
export function MemberAvatar({
  name,
  size = 32,
}: {
  name: string;
  size?: number;
}) {
  return (
    <Blobatar
      name={name.normalize("NFKC").trim().toLowerCase()}
      size={size}
      alt=""
      aria-hidden="true"
    />
  );
}
