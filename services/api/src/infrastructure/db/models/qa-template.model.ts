import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type QaTemplateStatus = 'enabled' | 'disabled';
export type QuestionType = 'architecture' | 'code' | 'doc' | 'people';

export interface QaOutputField {
  name: string;
  required: boolean;
}

export class QaTemplateModel extends BaseModel {
  static tableName = 'qa_templates';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  name!: string;
  questionTypes!: QuestionType[];
  keywords!: string[];
  outputFields!: QaOutputField[];
  previewTemplate!: string;
  applicableRoles!: string[] | null;
  status!: QaTemplateStatus;
  priority!: number;
  createdBy!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
