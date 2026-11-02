import * as v from "valibot";
import { ListeningRoom } from "@/features/listening-room";
import { roomCodeSchema } from "@/features/listening-room/contracts";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ room?: string | string[] }>;
}) {
  const { room } = await searchParams;
  const code = v.safeParse(roomCodeSchema, room);
  return (
    <ListeningRoom initialRoomCode={code.success ? code.output : undefined} />
  );
}
