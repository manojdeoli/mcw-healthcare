export const formFields = [
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'address', label: 'Address', type: 'text' },
    { name: 'email', label: 'Email Address', type: 'email' },
    { name: 'birthdate', label: 'Birth Date', type: 'date' },
];

export const generatePatientId = () => {
    // Generate CIP-SNS format (Spain National Health System Personal Identification Code)
    // Format: 10-digit number
    return 'CIP-' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
};
