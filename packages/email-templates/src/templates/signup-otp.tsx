import { Button, Column, Hr, Img, Link, Row, Section, Text, Heading } from '@react-email/components'
import * as React from 'react'
import { EmailLayout } from '../layouts/email-layout'

interface SignupOTPEmailProps {
  userFirstName: string
  otpCode: string
  companyName: string
  companyLogo: string
  expiresInMin: number
}

export const SignupOTPEmail = ({
  userFirstName,
  otpCode,
  companyName,
  companyLogo,
  expiresInMin
}: SignupOTPEmailProps) => {
  return (
    <EmailLayout previewText={`Your verification code is ${otpCode}`}>
      {/* Header */}
      <Section className="px-8 pt-10 pb-6 text-center">
        <Img
          src={companyLogo}
          width="40"
          height="40"
          alt={companyName}
          className="mx-auto mb-4 rounded-lg"
        />
        <Heading className="text-2xl font-bold text-gray-900 m-0">Verify your email</Heading>
      </Section>

      {/* Main Content */}
      <Section className="px-8 pb-8">
        <Text className="text-gray-600 text-base leading-relaxed">Hi {userFirstName},</Text>
        <Text className="text-gray-600 text-base leading-relaxed">
          Thanks for starting your journey with <strong>{companyName}</strong>. Use the following
          verification code to complete your registration. This code will expire in {expiresInMin ?? 5} minutes.
        </Text>

        {/* OTP Box - Simplified for maximum compatibility */}
        <Section className="bg-gray-50 rounded-lg border border-dashed border-gray-200 my-8 p-6 text-center">
          <Text className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">
            Your Code
          </Text>
          <Row>
            <Column>
              <Text className="text-4xl font-mono font-bold tracking-[12px] text-brand m-0">
                {otpCode}
              </Text>
            </Column>
          </Row>
        </Section>

        <Button
          href={`https://example.com/verify?code=${otpCode}`}
          className="bg-brand w-full text-white text-base font-semibold py-4 rounded-lg text-center"
        >
          Confirm Email Address
        </Button>

        <Text className="text-gray-400 text-sm mt-6 text-center italic">
          If you didn't request this, you can safely ignore this email.
        </Text>
      </Section>

      <Hr className="border-gray-100" />

      {/* Footer */}
      <Section className="px-8 py-6 bg-gray-50/50 text-center">
        <Row className="mb-4">
          <Column>
            <Link href="https://twitter.com/company" className="text-gray-400 mx-2 text-xs">
              Twitter
            </Link>
            <Link href="https://linkedin.com/company" className="text-gray-400 mx-2 text-xs">
              LinkedIn
            </Link>
          </Column>
        </Row>
        <Text className="text-gray-400 text-xs m-0">
          © {new Date().getFullYear()} {companyName}. All rights reserved.
        </Text>
        <Text className="text-gray-400 text-xs mt-1">123 Business St, San Francisco, CA 94107</Text>
      </Section>
    </EmailLayout>
  )
}
