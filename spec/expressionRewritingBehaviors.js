
describe('Expression Rewriting', function() {

    it('Should be able to parse simple object literals', function() {
        var result = ko.expressionRewriting.parseObjectLiteral("a: 1, b: 2, \"quotedKey\": 3, 'aposQuotedKey': 4");
        expect(result.length).toEqual(4);
        expect(result[0].key).toEqual("a");
        expect(result[0].value).toEqual("1");
        expect(result[1].key).toEqual("b");
        expect(result[1].value).toEqual("2");
        expect(result[2].key).toEqual("quotedKey");
        expect(result[2].value).toEqual("3");
        expect(result[3].key).toEqual("aposQuotedKey");
        expect(result[3].value).toEqual("4");
    });

    it('Should ignore any outer braces', function() {
        var result = ko.expressionRewriting.parseObjectLiteral("{a: 1}");
        expect(result.length).toEqual(1);
        expect(result[0].key).toEqual("a");
        expect(result[0].value).toEqual("1");
    });

    it('Should be able to parse object literals containing string literals', function() {
        var result = ko.expressionRewriting.parseObjectLiteral("a: \"comma, colon: brace{ bracket[ apos' escapedQuot\\\" end\", b: 'escapedApos\\\' brace} bracket] quot\"'");
        expect(result.length).toEqual(2);
        expect(result[0].key).toEqual("a");
        expect(result[0].value).toEqual("\"comma, colon: brace{ bracket[ apos' escapedQuot\\\" end\"");
        expect(result[1].key).toEqual("b");
        expect(result[1].value).toEqual("'escapedApos\\\' brace} bracket] quot\"'");
    });

    it('Should be able to parse object literals containing child objects, arrays, function literals, and newlines', function() {
        // The parsing may or may not keep unnecessary spaces. So to avoid confusion, avoid unnecessary spaces.
        var result = ko.expressionRewriting.parseObjectLiteral(
            "myObject:{someChild:{},someChildArray:[1,2,3],\"quotedChildProp\":'string value'},\n"
          + "someFn:function(a,b,c){var regex=/{/;var str='/})({';return{};},"
          + "myArray:[{},function(){},\"my'Str\",'my\"Str']"
        );
        expect(result.length).toEqual(3);
        expect(result[0].key).toEqual("myObject");
        expect(result[0].value).toEqual("{someChild:{},someChildArray:[1,2,3],\"quotedChildProp\":'string value'}");
        expect(result[1].key).toEqual("someFn");
        expect(result[1].value).toEqual("function(a,b,c){var regex=/{/;var str='/})({';return{};}");
        expect(result[2].key).toEqual("myArray");
        expect(result[2].value).toEqual("[{},function(){},\"my'Str\",'my\"Str']");
    });

    it('Should be able to cope with malformed syntax (things that aren\'t key-value pairs)', function() {
        var result = ko.expressionRewriting.parseObjectLiteral("malformed1, 'mal:formed2', good:3, { malformed: 4 }, good5:5");
        expect(result.length).toEqual(5);
        expect(result[0].unknown).toEqual("malformed1");
        expect(result[1].unknown).toEqual("mal:formed2");
        expect(result[2].key).toEqual("good");
        expect(result[2].value).toEqual("3");
        expect(result[4].key).toEqual("good5");
        expect(result[4].value).toEqual("5");
        // There's not really a good 'should' value for "{ malformed: 4 }", so don't check
    });

    it('Should ensure all keys are wrapped in quotes', function() {
        var rewritten = ko.expressionRewriting.preProcessBindings("a: 1, 'b': 2, \"c\": 3");
        expect(rewritten).toEqual("'a':1,'b':2,'c':3");
    });

    it('Should convert writable values to property accessors', function () {
        // This now only works for bindings that marked as two-way; so mark bindings a - j as such
        var w = ko.expressionRewriting.twoWayBindings;
        w.a = w.b = w.c = w.d = w.e = w.f = w.g = w.h = w.i = w.j = true;

        var rewritten = ko.expressionRewriting.preProcessBindings(
            'a : 1, b : firstName, c : function() { return "returnValue"; }, ' +
            'd: firstName+lastName, e: boss.firstName, f: boss . lastName, ' +
            'g: getAssitant(), h: getAssitant().firstName, i: getAssitant("[dummy]")[ "lastName" ], ' +
            'j: boss.firstName + boss.lastName'
        );

        // Clear the two-way flag
        w.a = w.b = w.c = w.d = w.e = w.f = w.g = w.h = w.i = w.j = false;

        var assistant = { firstName: "john", lastName: "english" };
        var model = {
            firstName: "bob", lastName: "smith",
            boss: { firstName: "rick", lastName: "martin" },
            getAssitant: function() { return assistant }
        };
        with (model) {
            var parsed = eval("({" + rewritten + "})");
            // test values of property
            expect(parsed.a).toEqual(1);
            expect(parsed.b).toEqual("bob");
            expect(parsed.c()).toEqual("returnValue");
            expect(parsed.d).toEqual("bobsmith");
            expect(parsed.e).toEqual("rick");
            expect(parsed.f).toEqual("martin");
            expect(parsed.g).toEqual(assistant);
            expect(parsed.h).toEqual("john");
            expect(parsed.i).toEqual("english");

            // test that only writable expressions are set up for writing
            // 'j' matches due to the simple checking for trailing property accessor
            expect(parsed._ko_property_writers).toHaveOwnProperties(['b','e','f','h','i','j']);

            // make sure writing to them works
            parsed._ko_property_writers.b("bob2");
            expect(model.firstName).toEqual("bob2");
            parsed._ko_property_writers.e("rick2");
            expect(model.boss.firstName).toEqual("rick2");
            parsed._ko_property_writers.f("martin2");
            expect(model.boss.lastName).toEqual("martin2");
            parsed._ko_property_writers.h("john2");
            expect(assistant.firstName).toEqual("john2");
            parsed._ko_property_writers.i("english2");
            expect(assistant.lastName).toEqual("english2");

            // make sure writing to 'j' doesn't error or actually change anything
            parsed._ko_property_writers.j("nothing at all");
            expect(model.boss.firstName).toEqual("rick2");
            expect(model.boss.lastName).toEqual("martin2");
        }
    });

    it('Should be able to eval rewritten literals that contain unquoted keywords as keys', function() {
        var rewritten = ko.expressionRewriting.preProcessBindings("if: true");
        expect(rewritten).toEqual("'if':true");
        var evaluated = eval("({" + rewritten + "})");
        expect(evaluated['if']).toEqual(true);
    });

    it('Should eval keys without a value as if the value is undefined', function() {
        var rewritten = ko.expressionRewriting.preProcessBindings("a: 1, b");
        var parsedRewritten = eval("({" + rewritten + "})");
        expect(parsedRewritten.a).toEqual(1);
        expect('b' in parsedRewritten).toBeTruthy();
        expect(parsedRewritten.b).toBeUndefined();
    });

    it('Should return accessor functions for each value when called with the valueAccessors option', function() {
        var rewritten = ko.expressionRewriting.preProcessBindings("a: 1", {valueAccessors:true});
        expect(rewritten).toEqual("'a':function(){return 1}");
        var evaluated = eval("({" + rewritten + "})");
        expect(evaluated['a']()).toEqual(1);
    });

    // The parser incorrectly processes sets of division symbols as regular expression delimiters (see #913)
    xit('Should be able to parse and evaluate object literals containing division', function() {
        var result = ko.expressionRewriting.parseObjectLiteral("a:2/1,b:6/2,c:0");
        expect(result).toEqual([{key:'a', value: '2/1'}, {key: 'b', value: '6/2'}, {key: 'c', value: '0'}]);
        var rewritten = ko.expressionRewriting.preProcessBindings(result, {valueAccessors:true});
        expect(rewritten).toEqual("'a':function(){return 2/1},'b':function(){return 6/2},'c':function(){return 0}");
        var evaluated = eval("({" + rewritten + "})");
        expect(evaluated.a()).toEqual(2);
        expect(evaluated.b()).toEqual(3);
        expect(evaluated.c()).toEqual(0);
    });
});
