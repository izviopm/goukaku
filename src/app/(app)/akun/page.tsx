import { Card, PageTitle } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const { email } = await getUser();
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <PageTitle sub={email}>Akun</PageTitle>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Ganti password</h2>
        <PasswordForm />
      </Card>
    </div>
  );
}
