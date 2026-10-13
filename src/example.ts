/** Shown on first visit, so there is something to look at before anything is pasted. */
export const EXAMPLE_TURTLE = `@prefix ex:     <http://example.org/> .
@prefix foaf:   <http://xmlns.com/foaf/0.1/> .
@prefix schema: <https://schema.org/> .
@prefix xsd:    <http://www.w3.org/2001/XMLSchema#> .

ex:alice a foaf:Person ;
    foaf:name "Alice Johnson" ;
    foaf:mbox <mailto:alice@example.org> ;
    schema:birthDate "1990-04-12"^^xsd:date ;
    schema:jobTitle "Data Engineer"@en, "Ingénieure de données"@fr ;
    foaf:knows ex:bob, ex:carol ;
    schema:worksFor ex:acme ;
    schema:address [
        a schema:PostalAddress ;
        schema:streetAddress "12 Elm Street" ;
        schema:addressLocality "Springfield" ;
        schema:postalCode "49007"
    ] .

ex:bob a foaf:Person ;
    foaf:name "Bob Smith" ;
    schema:age 34 ;
    foaf:knows ex:alice ;
    schema:worksFor ex:acme .

ex:carol a foaf:Person, schema:Author ;
    foaf:name "Carol Lee" ;
    schema:author ex:book1 .

ex:acme a schema:Organization ;
    schema:name "Acme Corp" ;
    schema:foundingDate "1998"^^xsd:gYear ;
    schema:numberOfEmployees 250 .

ex:book1 a schema:Book ;
    schema:name "Linked Data in Practice" ;
    schema:isbn "978-0-00-000000-0" ;
    schema:datePublished "2021-09-01"^^xsd:date ;
    schema:publisher ex:acme .
`;
