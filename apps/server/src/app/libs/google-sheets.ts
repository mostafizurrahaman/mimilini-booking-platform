import { google, sheets_v4 } from 'googleapis'
import fs from 'fs'
import path from 'path'
import configs from '@app/configs'
import { logger } from './logger'
import { AppError } from '@repo/shared'
import httpStatus from 'http-status'

const DEFAULT_SPREADSHEET_ID = '15wdGSXcReglZ912QdfhwBR-n5SSl1cnukPhMyMolLRw'
const DEFAULT_CLIENT_EMAIL = 'stunneralert@stunner-alert.iam.gserviceaccount.com'
const EXPECTED_HEADERS = ['Email', 'Role', 'Address', 'Submitted At']

interface IGoogleApiError {
  status?: number | undefined
  code?: number | undefined
  message?: string | undefined
}

const getGoogleApiError = (err: unknown): IGoogleApiError => {
  if (typeof err === 'object' && err !== null) {
    const errorObj = err as Record<string, unknown>
    return {
      status: typeof errorObj.status === 'number' ? errorObj.status : undefined,
      code: typeof errorObj.code === 'number' ? errorObj.code : undefined,
      message: typeof errorObj.message === 'string' ? errorObj.message : undefined,
    }
  }
  return { message: String(err) }
}

/**
 * Creates and returns an authenticated Google Sheets API client
 */
export const getGoogleSheetsClient = (): sheets_v4.Sheets => {
  let clientEmail: string | undefined =
    configs.googleSheets.serviceAccountEmail || DEFAULT_CLIENT_EMAIL
  let privateKey: string | undefined = configs.googleSheets.privateKey

  // 1. Check for service account JSON file if specified or present
  const candidatePaths = [
    configs.googleSheets.keyPath,
    path.join(process.cwd(), 'service-account.json'),
    path.join(process.cwd(), '..', '..', 'service-account.json'),
  ].filter(Boolean) as string[]

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      try {
        const fileContent = fs.readFileSync(candidatePath, 'utf-8')
        const json = JSON.parse(fileContent)
        if (json.client_email && json.private_key) {
          clientEmail = json.client_email
          privateKey = json.private_key
          break
        }
      } catch (error) {
        logger.warn(`Failed reading Google credentials from ${candidatePath}:`, error)
      }
    }
  }

  if (!clientEmail || !privateKey) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Google Sheets credentials not configured. Please set GOOGLE_PRIVATE_KEY in your environment or provide service-account.json.'
    )
  }

  // Handle escaped newlines in environment variable strings
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n')

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: formattedPrivateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    return google.sheets({ version: 'v4', auth })
  } catch (error) {
    logger.error('Failed to initialize Google Sheets auth:', error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to authenticate with Google Sheets API.'
    )
  }
}

/**
 * Gets the active sheet tab name, dynamically fetching the first sheet name if not specified
 */
export const getTargetSheetName = async (
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<string> => {
  if (configs.googleSheets.sheetName) {
    return configs.googleSheets.sheetName
  }

  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    })

    const firstSheetTitle = response.data.sheets?.[0]?.properties?.title
    return firstSheetTitle || 'Sheet1'
  } catch (error: unknown) {
    const apiError = getGoogleApiError(error)
    if (apiError.status === 403 || apiError.code === 403) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `Permission denied: Please ensure the spreadsheet is shared with ${DEFAULT_CLIENT_EMAIL} as Editor.`
      )
    }
    if (apiError.status === 404 || apiError.code === 404) {
      throw new AppError(httpStatus.NOT_FOUND, `Spreadsheet not found with ID: ${spreadsheetId}`)
    }
    throw error
  }
}

/**
 * Ensures header row exists in the spreadsheet
 */
export const ensureSheetHeaders = async (
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<void> => {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:D1`,
    })

    const rows = res.data.values || []
    if (rows.length === 0 || !rows[0] || rows[0].length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1:D1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [EXPECTED_HEADERS],
        },
      })
    }
  } catch (error: unknown) {
    const apiError = getGoogleApiError(error)
    logger.warn('Could not verify/initialize sheet headers:', apiError.message)
  }
}

/**
 * Checks if an email already exists in the Google spreadsheet
 */
export const checkEmailExistsInSheet = async (email: string): Promise<boolean> => {
  const sheets = getGoogleSheetsClient()
  const spreadsheetId = configs.googleSheets.sheetId || DEFAULT_SPREADSHEET_ID
  const sheetName = await getTargetSheetName(sheets, spreadsheetId)

  try {
    // Read column A where emails are stored
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:A`,
    })

    const values = response.data.values || []
    const normalizedTargetEmail = email.trim().toLowerCase()

    // Compare each cell in Column A
    for (const row of values) {
      if (row && row[0]) {
        const cellValue = String(row[0]).trim().toLowerCase()
        if (cellValue === normalizedTargetEmail) {
          return true
        }
      }
    }

    return false
  } catch (error: unknown) {
    if (error instanceof AppError) throw error
    const apiError = getGoogleApiError(error)
    if (apiError.status === 403 || apiError.code === 403) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `Permission denied: Please ensure the spreadsheet is shared with ${DEFAULT_CLIENT_EMAIL} as Editor.`
      )
    }
    logger.error('Error checking duplicate email in Google Sheet:', error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to verify email in spreadsheet: ${apiError.message || 'Unknown error'}`
    )
  }
}

/**
 * Appends a new waitlist record to the Google spreadsheet
 */
export const appendWaitlistToSheet = async (data: {
  email: string
  role: string
  address: string
  submittedAt?: string
}): Promise<{
  email: string
  role: string
  address: string
  submittedAt: string
}> => {
  const sheets = getGoogleSheetsClient()
  const spreadsheetId = configs.googleSheets.sheetId || DEFAULT_SPREADSHEET_ID
  const sheetName = await getTargetSheetName(sheets, spreadsheetId)

  // Ensure header row exists
  await ensureSheetHeaders(sheets, spreadsheetId, sheetName)

  const normalizedEmail = data.email.trim().toLowerCase()
  const role = data.role.trim()
  const address = data.address.trim()
  const submittedAt = data.submittedAt || new Date().toISOString()

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[normalizedEmail, role, address, submittedAt]],
      },
    })

    return {
      email: normalizedEmail,
      role,
      address,
      submittedAt,
    }
  } catch (error: unknown) {
    if (error instanceof AppError) throw error
    const apiError = getGoogleApiError(error)
    if (apiError.status === 403 || apiError.code === 403) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `Permission denied: Please ensure the spreadsheet is shared with ${DEFAULT_CLIENT_EMAIL} as Editor.`
      )
    }
    logger.error('Error appending row to Google Sheet:', error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to save waitlist entry to spreadsheet: ${apiError.message || 'Unknown error'}`
    )
  }
}

/**
 * Reads all waitlist entries from the Google spreadsheet
 */
export interface IWaitlistSheetEntry {
  email: string
  role: string
  address: string
  submittedAt?: string
}

export const getAllWaitlistFromSheet = async (): Promise<IWaitlistSheetEntry[]> => {
  const sheets = getGoogleSheetsClient()
  const spreadsheetId = configs.googleSheets.sheetId || DEFAULT_SPREADSHEET_ID
  const sheetName = await getTargetSheetName(sheets, spreadsheetId)

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A2:D`,
    })

    const rows = response.data.values || []

    return rows.map((row) => {
      const entry: IWaitlistSheetEntry = {
        email: row[0] ? String(row[0]).trim() : '',
        role: row[1] ? String(row[1]).trim() : '',
        address: row[2] ? String(row[2]).trim() : '',
      }
      if (row[3]) {
        entry.submittedAt = String(row[3]).trim()
      }
      return entry
    })
  } catch (error: unknown) {
    if (error instanceof AppError) throw error
    const apiError = getGoogleApiError(error)
    if (apiError.status === 403 || apiError.code === 403) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `Permission denied: Please ensure the spreadsheet is shared with ${DEFAULT_CLIENT_EMAIL} as Editor.`
      )
    }
    logger.error('Error fetching waitlist from Google Sheet:', error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to retrieve waitlist entries from spreadsheet: ${apiError.message || 'Unknown error'}`
    )
  }
}
