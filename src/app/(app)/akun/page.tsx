import { KeyRound } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Card, PageTitle, SectionTitle } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const { email } = await getUser();
  return (
    <Reveal className="mx-auto flex w-full max-w-md flex-col gap-6">
      <PageTitle sub={email}>Account</PageTitle>
      <Card>
        <SectionTitle icon={KeyRound}>Change password</SectionTitle>
        <PasswordForm />
      </Card>
    </Reveal>
  );
}
