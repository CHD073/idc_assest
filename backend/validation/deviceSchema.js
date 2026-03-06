const Joi = require('joi');
const DeviceField = require('../models/DeviceField');

const DEVICE_TYPES = ['server', 'switch', 'router', 'storage', 'other'];
const DEVICE_STATUS = ['running', 'maintenance', 'offline', 'fault'];

const baseFieldSchemas = {
  deviceId: Joi.string()
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .allow('', null)
    .messages({
      'string.max': '设备ID不能超过50个字符',
      'string.pattern.base': '设备ID只能包含字母、数字、下划线和横线'
    }),

  name: Joi.string()
    .max(100)
    .messages({
      'string.empty': '设备名称不能为空',
      'string.max': '设备名称不能超过100个字符'
    }),

  type: Joi.string()
    .valid(...DEVICE_TYPES)
    .messages({
      'string.empty': '设备类型不能为空',
      'any.only': `设备类型必须是以下之一: ${DEVICE_TYPES.join(', ')}`
    }),

  model: Joi.string()
    .max(100)
    .allow('', null)
    .messages({
      'string.max': '型号不能超过100个字符'
    }),

  serialNumber: Joi.string()
    .max(100)
    .messages({
      'string.empty': '序列号不能为空',
      'string.max': '序列号不能超过100个字符'
    }),

  rackId: Joi.string()
    .max(50)
    .messages({
      'string.empty': '机柜ID不能为空',
      'string.max': '机柜ID不能超过50个字符'
    }),

  position: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .messages({
      'number.base': '位置必须是数字',
      'number.integer': '位置必须是整数',
      'number.min': '位置不能小于1',
      'number.max': '位置不能大于100'
    }),

  height: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .messages({
      'number.base': '高度必须是数字',
      'number.integer': '高度必须是整数',
      'number.min': '高度不能小于1',
      'number.max': '高度不能大于50'
    }),

  powerConsumption: Joi.number()
    .min(0)
    .max(100000)
    .messages({
      'number.base': '功率必须是数字',
      'number.min': '功率不能小于0',
      'number.max': '功率不能超过100000'
    }),

  ipAddress: Joi.string()
    .ip({ version: ['ipv4', 'ipv6'] })
    .allow('', null)
    .messages({
      'string.ip': 'IP地址格式无效'
    }),

  status: Joi.string()
    .valid(...DEVICE_STATUS)
    .default('offline')
    .messages({
      'any.only': `状态必须是以下之一: ${DEVICE_STATUS.join(', ')}`
    }),

  purchaseDate: Joi.date()
    .allow(null)
    .messages({
      'date.base': '购买日期格式无效'
    }),

  warrantyExpiry: Joi.date()
    .allow(null)
    .messages({
      'date.base': '保修到期日期格式无效'
    }),

  description: Joi.string()
    .max(500)
    .allow('', null)
    .messages({
      'string.max': '描述不能超过500个字符'
    }),

  customFields: Joi.object().allow(null)
};

async function buildDynamicSchema(isCreate = true) {
  const fields = await DeviceField.findAll({
    where: { isSystem: true },
    order: [['order', 'ASC']]
  });

  const schemaObj = {};

  fields.forEach(field => {
    const baseSchema = baseFieldSchemas[field.fieldName];
    if (baseSchema) {
      let fieldSchema = baseSchema.clone();
      
      if (field.required && isCreate) {
        fieldSchema = fieldSchema.required();
      }
      
      schemaObj[field.fieldName] = fieldSchema;
    }
  });

  schemaObj.customFields = baseFieldSchemas.customFields;

  return Joi.object(schemaObj).custom((value, helpers) => {
    if (value.purchaseDate && value.warrantyExpiry) {
      const purchase = new Date(value.purchaseDate);
      const warranty = new Date(value.warrantyExpiry);
      if (warranty <= purchase) {
        return helpers.error('date.warrantyAfterPurchase');
      }
    }
    return value;
  }).messages({
    'date.warrantyAfterPurchase': '保修到期日期必须晚于购买日期'
  });
}

async function getCreateDeviceSchema() {
  return buildDynamicSchema(true);
}

async function getUpdateDeviceSchema() {
  const schema = await buildDynamicSchema(false);
  return schema.min(1).messages({
    'object.min': '至少需要提供一个字段进行更新'
  });
}

const batchDeviceIdsSchema = Joi.object({
  deviceIds: Joi.array()
    .items(Joi.string().required())
    .min(1)
    .required()
    .messages({
      'array.base': '设备ID列表必须是数组',
      'array.min': '至少需要提供一个设备ID',
      'any.required': '设备ID列表是必填字段'
    })
});

const batchStatusSchema = Joi.object({
  deviceIds: Joi.array()
    .items(Joi.string().required())
    .min(1)
    .required()
    .messages({
      'array.base': '设备ID列表必须是数组',
      'array.min': '至少需要提供一个设备ID',
      'any.required': '设备ID列表是必填字段'
    }),
  status: Joi.string()
    .valid(...DEVICE_STATUS)
    .required()
    .messages({
      'any.only': `状态必须是以下之一: ${DEVICE_STATUS.join(', ')}`,
      'any.required': '状态是必填字段'
    })
});

const batchMoveSchema = Joi.object({
  deviceIds: Joi.array()
    .items(Joi.string().required())
    .min(1)
    .required(),
  targetRackId: Joi.string()
    .required()
    .max(50)
    .messages({
      'string.empty': '目标机柜ID不能为空',
      'any.required': '目标机柜ID是必填字段'
    }),
  startPosition: Joi.number()
    .integer()
    .min(1)
    .allow(null)
});

const queryDeviceSchema = Joi.object({
  keyword: Joi.string()
    .max(100)
    .allow(''),
  status: Joi.string()
    .valid(...DEVICE_STATUS, 'all')
    .allow(''),
  type: Joi.string()
    .valid(...DEVICE_TYPES, 'all')
    .allow(''),
  rackId: Joi.string()
    .max(50)
    .allow(''),
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
});

const createDeviceSchema = {
  validate: async (data, options = {}) => {
    const schema = await getCreateDeviceSchema();
    return schema.validate(data, options);
  }
};

const updateDeviceSchema = {
  validate: async (data, options = {}) => {
    const schema = await getUpdateDeviceSchema();
    return schema.validate(data, options);
  }
};

module.exports = {
  createDeviceSchema,
  updateDeviceSchema,
  batchDeviceIdsSchema,
  batchStatusSchema,
  batchMoveSchema,
  queryDeviceSchema,
  DEVICE_TYPES,
  DEVICE_STATUS,
  getCreateDeviceSchema,
  getUpdateDeviceSchema
};
