import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { categoryControllers } from './category.controllers'
import { categoryValidations } from './category.validations'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.post(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(categoryValidations.createCategorySchema),
  categoryControllers.createCategory
)

router.patch(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(categoryValidations.updateCategorySchema),
  categoryControllers.updateCategory
)

router.get(
  '/all',
  auth(),
  validateRequest(categoryValidations.getAllCategorySchema),
  categoryControllers.getAllCategory
)

router.get(
  '/:id',
  validateRequest(categoryValidations.getCategoryByIdSchema),
  categoryControllers.getCategoryById
)

// ?? TODO: Later we will handle it. 
router.delete(
  '/:id',
  validateRequest(categoryValidations.deleteCategoryByIdSchema),
  categoryControllers.deleteCategoryById
)

export const categoryRoutes = router
