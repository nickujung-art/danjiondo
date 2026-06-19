import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = { title: '로그인' }

interface Props {
  searchParams: Promise<{ error?: string; next?: string }>
}

const ERROR_MSG: Record<string, string> = {
  auth:  '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
  oauth: 'OAuth 로그인에 실패했습니다. 다시 시도해주세요.',
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams
  const errorMsg = error ? (ERROR_MSG[error] ?? '알 수 없는 오류가 발생했습니다.') : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-gray-900">단지온도</h1>
        <p className="mb-6 text-sm text-gray-500">창원·김해 실거래가 서비스</p>

        {errorMsg && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMsg}
          </p>
        )}

        <LoginForm />

        <p className="mt-6 text-center text-xs text-gray-400">
          로그인 시{' '}
          <Link href="/legal/terms" className="underline hover:text-gray-600">이용약관</Link>
          {' '}및{' '}
          <Link href="/legal/privacy" className="underline hover:text-gray-600">개인정보처리방침</Link>
          에 동의합니다
        </p>
      </div>
    </main>
  )
}
