import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "../../../generated/prisma/enums";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../users/guards/roles.decorator";
import { RolesGuard } from "../users/guards/roles.guard";

import { TaxRulesService } from "./tax-rules.service";
import { CreateTaxRuleDto } from "./dto/create-tax-rule.dto";
import { ListTaxRulesDto } from "./dto/list-tax-rules.dto";
import { UpdateTaxRuleDto } from "./dto/update-tax-rule.dto";

@ApiTags("tax-rules")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("tax-rules")
export class TaxRulesController {
  constructor(private readonly taxRulesService: TaxRulesService) {}

  // POST /tax-rules
  @Post()
  @ApiOperation({
    summary: "Create a tax rule (admin only)",
    description:
      "Creates a new tax rule. Lower priority number = higher precedence when multiple rules match an item. " +
      "A rule with no categoryId or brandId applies to all items in the matching country/region.",
  })
  @ApiCreatedResponse({ description: "Created tax rule" })
  @ApiNotFoundResponse({ description: "Category or brand not found" })
  create(@Body() dto: CreateTaxRuleDto) {
    return this.taxRulesService.create(dto);
  }

  // GET /tax-rules
  @Get()
  @ApiOperation({
    summary: "List tax rules (admin only)",
    description:
      "Paginated list ordered by priority then creation date. Filter by status, country, category, or brand.",
  })
  @ApiOkResponse({ description: "Paginated tax rule list" })
  findAll(@Query() query: ListTaxRulesDto) {
    return this.taxRulesService.findAll(query);
  }

  // GET /tax-rules/:id
  @Get(":id")
  @ApiOperation({ summary: "Get a tax rule by ID (admin only)" })
  @ApiParam({ name: "id", description: "Tax rule cuid" })
  @ApiOkResponse({ description: "Tax rule detail" })
  @ApiNotFoundResponse({ description: "Tax rule not found" })
  findById(@Param("id") id: string) {
    return this.taxRulesService.findById(id);
  }

  // PATCH /tax-rules/:id
  @Patch(":id")
  @ApiOperation({
    summary: "Update a tax rule (admin only)",
    description: "All fields optional. To deactivate a rule, set status to INACTIVE.",
  })
  @ApiParam({ name: "id", description: "Tax rule cuid" })
  @ApiOkResponse({ description: "Updated tax rule" })
  @ApiNotFoundResponse({ description: "Tax rule not found" })
  update(@Param("id") id: string, @Body() dto: UpdateTaxRuleDto) {
    return this.taxRulesService.update(id, dto);
  }

  // DELETE /tax-rules/:id
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a tax rule (admin only)",
    description:
      "Permanently deletes the rule. Consider setting status to INACTIVE instead to preserve audit history.",
  })
  @ApiParam({ name: "id", description: "Tax rule cuid" })
  @ApiNoContentResponse({ description: "Tax rule deleted" })
  @ApiNotFoundResponse({ description: "Tax rule not found" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.taxRulesService.remove(id);
  }
}
