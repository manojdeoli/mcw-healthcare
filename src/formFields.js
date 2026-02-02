export const formFields = [
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'address', label: 'Address', type: 'text' },
    { name: 'email', label: 'Email Address', type: 'email' },
    { name: 'birthdate', label: 'Birth Date', type: 'date' },
];

export const generatePatientId = () => {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
};
