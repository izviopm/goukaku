/* eslint-disable @next/next/no-img-element -- avatars come from Supabase Storage; a plain img avoids remotePatterns config */

export type Gender = "male" | "female" | null;

const SIZES = { sm: "size-8", md: "size-10", lg: "size-24" } as const;

/** Public URL of an object in the "avatars" bucket. */
export function avatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

/** Uploaded photo if there is one, otherwise a default illustration chosen by gender. */
export function Avatar({ path, gender, name, size = "md" }: { path?: string | null; gender?: Gender; name?: string; size?: keyof typeof SIZES }) {
  const url = avatarUrl(path);
  const cls = `${SIZES[size]} shrink-0 rounded-full object-cover`;
  if (url) return <img src={url} alt={name ? `${name}'s profile photo` : "Profile photo"} className={cls} />;
  return <DefaultAvatar gender={gender ?? null} className={cls} label={name ? `${name}'s profile photo` : "Profile photo"} />;
}

function DefaultAvatar({ gender, className, label }: { gender: Gender; className: string; label: string }) {
  // Token colors (UI_RULES 4): ai blue for male, mikan orange for female, muted for not set.
  const bg = gender === "male" ? "#DCEBF5" : gender === "female" ? "#FCD9B6" : "#EEF3F8";
  const fg = gender === "male" ? "#2F5D8C" : gender === "female" ? "#9A3412" : "#475569";
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={label} className={className}>
      <rect width="64" height="64" rx="32" fill={bg} />
      {gender === "female" ? (
        <>
          {/* Longer hair framing the face */}
          <path d="M18 34c0-11 6-19 14-19s14 8 14 19v8H18z" fill={fg} />
          <circle cx="32" cy="29" r="10" fill={bg} stroke={fg} strokeWidth="2.5" />
          <path d="M14 60c2-10 9-15 18-15s16 5 18 15" fill={fg} />
        </>
      ) : gender === "male" ? (
        <>
          <circle cx="32" cy="27" r="11" fill={fg} />
          <path d="M21 25c2-7 7-10 11-10s9 3 11 10c-4-3-8-4-11-4s-7 1-11 4z" fill={bg} opacity="0.35" />
          <path d="M12 60c2-11 10-17 20-17s18 6 20 17" fill={fg} />
        </>
      ) : (
        <>
          <circle cx="32" cy="27" r="10" fill={fg} />
          <path d="M13 60c2-10 9-16 19-16s17 6 19 16" fill={fg} />
        </>
      )}
    </svg>
  );
}
