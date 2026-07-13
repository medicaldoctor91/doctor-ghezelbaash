# Social profile restoration note

The physician-owned Facebook, Pinterest and LinkedIn profiles are explicit identity anchors for `https://www.ghezelbaash.ir/#person`.

Required URLs:

- LinkedIn: https://www.linkedin.com/in/saeed-ghezelbash-93310a96
- Facebook: https://www.facebook.com/Ghezelbaash/
- Pinterest: https://www.pinterest.com/qezelbaash/

All three must remain in `Person.sameAs`. Facebook and Pinterest also remain represented as `ProfilePage` nodes in the canonical graph. Release validation must fail if any of the three is removed.
