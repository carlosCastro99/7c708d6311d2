interface ErrorBannerProps {
  message: string
}

export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div role="alert" style={{ background: '#fdecea', color: '#d93025', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem' }}>
      {message}
    </div>
  )
}
