import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signInAction, signUpAction } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[]
  }>
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorMessage = getSearchParam(params.error)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>App Finanzas</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {errorMessage ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}

          <form action={signInAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                name="password"
                type="password"
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>

          <Separator />

          <form action={signUpAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-name">Display name</Label>
              <Input
                id="signup-name"
                name="displayName"
                placeholder="Andrés"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                name="password"
                type="password"
                required
              />
            </div>

            <Button type="submit" variant="outline" className="w-full">
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
