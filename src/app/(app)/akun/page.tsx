import { KeyRound, UserRound } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Card, PageTitle, SectionTitle } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const { email, name, gender, avatarPath } = await getUser();
  return (
    <Reveal className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageTitle sub="Your name and photo appear in the app header.">My profile</PageTitle>
      <Card>
        <SectionTitle icon={UserRound}>Profile</SectionTitle>
        <ProfileForm name={name} gender={gender} email={email} avatarPath={avatarPath} />
      </Card>
      <Card>
        <SectionTitle icon={KeyRound}>Change password</SectionTitle>
        <PasswordForm />
      </Card>
    </Reveal>
  );
}
