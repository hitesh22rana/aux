import { MemberAvatar } from "./member-avatar";
import styles from "./member-avatar-group.module.css";

export function MemberAvatarGroup({
  members,
}: {
  members: readonly { id: string; name: string }[];
}) {
  const visible = members.slice(0, 3);
  const remaining = members.length - visible.length;
  return (
    <div
      className={styles.group}
      role="group"
      aria-label={`${members.length} people in the room`}
    >
      {visible.map((member) => (
        <span
          key={member.id}
          className={styles.avatar}
          role="img"
          aria-label={member.name}
        >
          <MemberAvatar name={member.name} size={32} />
        </span>
      ))}
      {remaining > 0 && (
        <span
          className={`${styles.avatar} ${styles.count}`}
          aria-label={`${remaining} more people`}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
