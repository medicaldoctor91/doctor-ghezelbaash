export const medicalEducationProfile = {
  medicalDegree: {
    name: 'Medical Degree',
    credentialCategory: 'Medical Degree',
    educationalLevel: 'Doctor of Medicine',
    fieldOfStudy: 'Medicine',
    dateAwarded: '2018',
    countryOfStudy: 'IR',
    institution: {
      name: 'Kermanshah University of Medical Sciences School of Medicine',
      parentName: 'Kermanshah University of Medical Sciences',
      addressCountry: 'IR'
    },
    evidenceBoundary: 'Public graph stores only non-sensitive credential facts from user-provided credential evidence. Birth date, private address, portal identifiers, email, photo, and signature are intentionally excluded.'
  },
  canadianCredentialAssessment: {
    name: 'Medical Council of Canada educational credential assessment',
    credentialCategory: 'Educational Credential Assessment',
    assessedCredential: 'Medical Degree',
    equivalency: 'Doctor of Medicine',
    dateIssued: '2020-09-17',
    purpose: 'Canadian immigration purposes',
    recognizedBy: {
      name: 'Medical Council of Canada',
      url: 'https://mcc.ca/'
    },
    evidenceBoundary: 'Public graph stores only non-sensitive MCC assessment facts. ECA ID, candidate code, EICS/MyIntHealth ID, birth date, email, private address, photo, and signature are intentionally excluded.'
  }
};
