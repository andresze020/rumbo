import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { signInAction, signUpAction } from './actions'
import { GoogleSignInButton } from './google-sign-in-button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { SubmitButton } from '@/components/submit-button'
import { cn } from '@/lib/utils'

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[]
    mode?: string
  }>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorMessage = getParam(params.error)
  const mode = params.mode === 'signup' ? 'signup' : 'signin'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const tabClass = (active: boolean) =>
    cn(
      'flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-colors',
      active
        ? 'bg-card text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    )

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-primary/6 via-background to-background p-4 sm:p-6">

      {/* Brand mark */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30 text-primary-foreground">
          <Wallet className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">App Finanzas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your household finances, organized.
          </p>
        </div>
      </div>

      {/* Card */}
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 pt-6">

          {/* Error */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </div>
          )}

          {/* Google */}
          <GoogleSignInButton />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <Link href="/login" className={tabClass(mode === 'signin')}>
              Sign in
            </Link>
            <Link href="/login?mode=signup" className={tabClass(mode === 'signup')}>
              Create account
            </Link>
          </div>

          {/* Sign in form */}
          {mode === 'signin' && (
            <form action={signInAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <SubmitButton type="submit" className="w-full" pendingText="Signing in…">
                Sign in
              </SubmitButton>
            </form>
          )}

          {/* Create account form */}
          {mode === 'signup' && (
            <form action={signUpAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name">Display name</Label>
                <Input
                  id="signup-name"
                  name="displayName"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <SubmitButton
                type="submit"
                variant="outline"
                className="w-full"
                pendingText="Creating account…"
              >
                Create account
              </SubmitButton>
            </form>
          )}

        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        Your data stays private and is never shared.
      </p>

    </main>
  )
}
