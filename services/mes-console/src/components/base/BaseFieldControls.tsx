import React from 'react';
import { Calendar } from '../ui/calendar';
import { Checkbox } from '../ui/checkbox';

export function BaseDatePicker(props: React.ComponentProps<typeof Calendar>) { return <Calendar {...props} />; }
export function BaseTimePicker(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input type="time" {...props} className={`mes-form-field ${props.className || ''}`} />; }
export function BaseCheckbox(props: React.ComponentProps<typeof Checkbox>) { return <Checkbox {...props} />; }
