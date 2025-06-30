import Joi from 'joi';

const clientSchema = Joi.object({
    id: Joi.string()
        .trim()
        .min(1)
        .required()
        .messages({
            'string.empty': 'ID cannot be empty',
            'any.required': 'ID is required'
        }),

    firstName: Joi.string()
        .trim()
        .min(1)
        .required()
        .messages({
            'string.empty': 'First name cannot be empty',
            'any.required': 'First name is required'
        }),

    lastName: Joi.string()
        .trim()
        .min(1)
        .required()
        .messages({
            'string.empty': 'Last name cannot be empty',
            'any.required': 'Last name is required'
        }),

    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Invalid email',
            'any.required': 'Email is required'
        }),

    age: Joi.number()
        .integer()
        .min(1)
        .max(120)
        .required()
        .messages({
            'number.base': 'Age must be a number',
            'number.integer': 'Age must be an integer',
            'number.min': 'Age must be greater than 0',
            'number.max': 'Age cannot be greater than 120',
            'any.required': 'Age is required'
        })
});

const lineFormatSchema = Joi.string()
    .pattern(/^[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+$/)
    .messages({
        'string.pattern.base': 'Invalid line format. Must have exactly 5 fields separated by |'
    });

export class Client {
    constructor(public id: string, public firstName: string, public lastName: string, public email: string, public age: number, public originalLine: string) { }

    isValid(): { valid: boolean; errors: string[] } {
        const { error } = clientSchema.validate({
            id: this.id,
            firstName: this.firstName,
            lastName: this.lastName,
            email: this.email,
            age: this.age
        }, { abortEarly: false });

        if (error) {
            const errors = error.details.map(detail => detail.message);
            return { valid: false, errors };
        }

        return { valid: true, errors: [] };
    }

    static validateFormat(line: string): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        const { error: formatError } = lineFormatSchema.validate(line);
        if (formatError) {
            errors.push(formatError.details[0].message);
            return { isValid: false, errors };
        }

        const fields = line.split('|');
        const clientTemp = {
            id: fields[0]?.trim() || '',
            firstName: fields[1]?.trim() || '',
            lastName: fields[2]?.trim() || '',
            email: fields[3]?.trim() || '',
            age: parseInt(fields[4]?.trim() || '0')
        };

        const { error } = clientSchema.validate(clientTemp, { abortEarly: false });

        if (error) {
            error.details.forEach(detail => {
                errors.push(detail.message);
            });
        }

        return { isValid: errors.length === 0, errors };
    }

    static createFromLine(line: string): { client: Client | null; errors: string[] } {
        const validation = Client.validateFormat(line);

        if (!validation.isValid) {
            return { client: null, errors: validation.errors };
        }

        const fields = line.split('|');

        try {
            const client = new Client(
                fields[0].trim(),
                fields[1].trim(),
                fields[2].trim(),
                fields[3].trim(),
                parseInt(fields[4].trim()),
                line
            );

            return { client, errors: [] };
        } catch (error) {
            return { client: null, errors: ['Error creating client'] };
        }
    }
}

export function validateClients(clients: Client[]): {
    valids: Client[];
    invalids: { client: Client; errors: string[] }[]
} {
    const valids: Client[] = [];
    const invalids: { client: Client; errors: string[] }[] = [];

    clients.forEach(client => {
        const validation = client.isValid();
        if (validation.valid) {
            valids.push(client);
        } else {
            invalids.push({ client, errors: validation.errors });
        }
    });

    return { valids, invalids };
}