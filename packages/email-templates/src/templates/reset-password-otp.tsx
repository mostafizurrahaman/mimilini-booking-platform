// reset-password-otp-email.tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Font,
} from '@react-email/components'
import * as React from 'react'

interface ResetPasswordOTPEmailProps {
  userFirstName?: string
  otpCode?: string
  userEmail?: string
  expirationMinutes?: number
  companyName?: string
  companyLogo?: string
}

export const ResetPasswordOTPEmail = ({
  userFirstName = 'User',
  otpCode = '123456',
  userEmail = 'user@example.com',
  expirationMinutes = 5,
  companyName = 'Your Company',
  companyLogo = 'https://via.placeholder.com/120x40/5850EC/ffffff?text=LOGO',
}: ResetPasswordOTPEmailProps) => {
  const previewText = `Your password reset code is ${otpCode}`

  // Simplified color scheme
  const colors = {
    primary: '#5850EC',
    primaryLight: '#F4F3FF',
    dark: '#1F2937',
    gray: '#6B7280',
    lightGray: '#F9FAFB',
    white: '#FFFFFF',
    border: '#E5E7EB',
    success: '#10B981',
    warning: '#F59E0B',
  }

  // Styles
  const main = {
    backgroundColor: colors.lightGray,
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
  }

  const container = {
    margin: '0 auto',
    padding: '40px 20px',
    maxWidth: '560px',
  }

  const card = {
    backgroundColor: colors.white,
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  }

  const header = {
    backgroundColor: colors.primary,
    padding: '32px',
    textAlign: 'center' as const,
  }

  const content = {
    padding: '32px',
  }

  const heading = {
    color: colors.dark,
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '32px',
    margin: '0 0 16px',
  }

  const paragraph = {
    color: colors.gray,
    fontSize: '16px',
    lineHeight: '24px',
    margin: '0 0 16px',
  }

  const otpContainer = {
    backgroundColor: colors.primaryLight,
    borderRadius: '8px',
    margin: '32px 0',
    padding: '24px',
    textAlign: 'center' as const,
  }

  const otpCodeStyle = {
    color: colors.primary,
    fontSize: '36px',
    fontWeight: '700',
    letterSpacing: '8px',
    lineHeight: '48px',
    margin: '0',
  }

  const button = {
    backgroundColor: colors.primary,
    borderRadius: '8px',
    color: colors.white,
    display: 'inline-block',
    fontSize: '16px',
    fontWeight: '600',
    lineHeight: '48px',
    padding: '0 24px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  }

  const alert = {
    backgroundColor: '#FEF3C7',
    border: '1px solid #FCD34D',
    borderRadius: '8px',
    padding: '12px 16px',
    margin: '24px 0',
  }

  const alertText = {
    color: '#92400E',
    fontSize: '14px',
    lineHeight: '20px',
    margin: '0',
  }

  const footer = {
    padding: '24px 32px',
    backgroundColor: colors.lightGray,
    borderTop: `1px solid ${colors.border}`,
  }

  const footerText = {
    color: colors.gray,
    fontSize: '14px',
    lineHeight: '20px',
    margin: '0',
    textAlign: 'center' as const,
  }

  const link = {
    color: colors.primary,
    textDecoration: 'underline',
  }

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            {/* Header */}
            <Container style={header}>
              <Img
                src={companyLogo}
                width="120"
                height="40"
                alt={companyName}
                style={{ margin: '0 auto' }}
              />
            </Container>

            {/* Main Content */}
            <Container style={content}>
              <Heading style={heading}>Reset Your Password</Heading>

              <Text style={paragraph}>Hi {userFirstName},</Text>

              <Text style={paragraph}>
                We received a request to reset your password for your account associated with{' '}
                {userEmail}.
              </Text>

              <Text style={paragraph}>Use the verification code below to reset your password:</Text>

              {/* OTP Code */}
              <Container style={otpContainer}>
                <Text style={otpCodeStyle}>{otpCode}</Text>
                <Text
                  style={{ ...paragraph, fontSize: '14px', marginTop: '8px', marginBottom: '0' }}
                >
                  Valid for {expirationMinutes} minutes
                </Text>
              </Container>

              {/* CTA Button */}
              <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button href="https://example.com/reset-password" style={button}>
                  Reset Password
                </Button>
              </Section>

              {/* Warning Alert */}
              <Container style={alert}>
                <Text style={alertText}>
                  <strong>⚠️ Didn't request this?</strong>
                  <br />
                  If you didn't request a password reset, you can safely ignore this email. Your
                  password won't be changed.
                </Text>
              </Container>

              {/* Security Tips */}
              <Text style={{ ...paragraph, fontSize: '14px', marginTop: '24px' }}>
                <strong>Security Tips:</strong>
              </Text>
              <Text style={{ ...paragraph, fontSize: '14px', marginLeft: '16px' }}>
                • Never share this code with anyone
                <br />
                • Our team will never ask for your password
                <br />• Make sure you're on our official website
              </Text>
            </Container>

            {/* Footer */}
            <Container style={footer}>
              <Text style={footerText}>
                Need help?{' '}
                <Link href="mailto:support@example.com" style={link}>
                  Contact Support
                </Link>
              </Text>
              <Text style={{ ...footerText, fontSize: '12px', marginTop: '16px' }}>
                © {new Date().getFullYear()} {companyName}. All rights reserved.
              </Text>
            </Container>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}


