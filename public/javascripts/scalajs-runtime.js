/* ---------------------------------- *
 * The top-level Scala.js environment *
 * ---------------------------------- */

function $ScalaJSEnvironmentClass(global) {
  // Fields
  this.global = global;
  this.primitives = {};
  this.classes = {};
  this.modules = {};
  this.natives = {};

  // Short fields used a lot by the codegen
  this.g = global; // Global scope
  this.c = {};     // Constructors
  this.m = {};     // Module instances

  // Core mechanism

  function defineLazyField(obj, propName, computeFun) {
    Object.defineProperty(obj, propName, {
      __proto__: null,
      enumerable: true,
      configurable: true,
      get: function() {
        var value = computeFun.call(obj);
        Object.defineProperty(obj, propName, {
          __proto__: null,
          enumerable: true,
          configurable: false,
          writable: false,
          value: value
        });
        return value;
      }
    });
  }

  this.createType = function(name, constructor, jsconstructor,
                             parent, ancestors, isPrimitive,
                             isInterface, isArray, componentData, zero,
                             arrayEncodedName, displayName) {
    var self = this;

    var data = {
      name: name,
      constructor: constructor,
      jsconstructor: jsconstructor,
      parent: parent,
      parentData: parent === null ? null : this.classes[parent],
      ancestors: ancestors,
      isPrimitive: isPrimitive,
      isInterface: isInterface,
      isArray: isArray,
      componentData: componentData,
      zero: zero,
      arrayEncodedName: arrayEncodedName,
      displayName: displayName,
      _class: undefined,
      get cls() {
        if (this._class === undefined)
          this._class = self.createClassInstance(this);
        return this._class;
      },
      _array: undefined,
      get array() {
        if (this._array === undefined)
          this._array = self.createArrayClass(this);
        return this._array;
      }
    };

    if (constructor !== undefined)
      constructor.prototype.$classData = data;

    if (!isPrimitive && !isArray) {
      Object.defineProperty(this.classes, name, {
        __proto__: null,
        enumerable: true,
        configurable: false,
        writable: false,
        value: data
      });
    } else if (isPrimitive) {
      Object.defineProperty(this.primitives, name, {
        __proto__: null,
        enumerable: true,
        configurable: false,
        writable: false,
        value: data
      });
    }

    return data;
  }

  this.createClass = function(name, constructor, jsconstructor,
                              parent, ancestors) {
    return this.createType(name, constructor, jsconstructor,
                           parent, ancestors,
                           false, false, false, null, null,
                           "L" + name + ";", name);
  };

  this.createPrimitiveType = function(name, zero, arrayEncodedName,
                                      displayName) {
    var ancestors = {};
    ancestors[name] = true;
    return this.createType(name, undefined, undefined,
                           null, ancestors,
                           true, false, false, null, zero,
                           arrayEncodedName, displayName);
  };

  this.createArrayClass = function(componentData) {
    var name = componentData.name + "[]";
    var encodedName = "[" + componentData.arrayEncodedName;
    var constructor = this.createArrayTypeFunction(name, componentData);

    var compAncestors = componentData.ancestors;
    var ancestors = {"java.lang.Object": true};
    for (var compAncestor in compAncestors)
      ancestors[compAncestor+"[]"] = true;

    return this.createType(name, constructor, constructor,
                           "java.lang.Object", ancestors,
                           false, false, true, componentData, null,
                           encodedName, encodedName);
  };

  this.createInterface = function(name, ancestors) {
    return this.createType(name, undefined, undefined,
                           null, ancestors,
                           false, true, false, null, null,
                           "L" + name + ";", name);
  };

  this.registerClass = function(name, createFunction) {
    var self = this;
    Object.defineProperty(this.classes, name, {
      __proto__: null,
      enumerable: true,
      configurable: true,
      get: function() {
        createFunction(self); // hopefully this calls createClass(name) ...
        return this[name];    // ... otherwise this will recurse infinitely
      }
    });

    defineLazyField(this.c, name, function() {
      return self.classes[name].constructor;
    });
  }

  this.registerModule = function(name, className) {
    var self = this;
    var data = {
      _instance: undefined,
      get instance() {
        if (this._instance === undefined)
          this._instance = new self.classes[className].jsconstructor();
        return this._instance;
      }
    };
    this.modules[name] = data;

    defineLazyField(this.m, name, function() {
      return self.modules[name].instance;
    });
  }

  this.createClassInstance = function(data) {
    /* Keep the full mangled name here because the constructor is private
     * and hence does not appear in the JavaScript bridge. */
    return new this.c["java.lang.Class"]()
      ["<init>(Lscala.js.Dynamic;Lscala.js.Dynamic;)"](this, data);
  }

  this.registerNative = function(fullName, nativeFunction) {
    this.natives[fullName] = nativeFunction;
  }

  // Create primitive types

  this.createPrimitiveType("scala.Unit", undefined, "V", "void");
  this.createPrimitiveType("scala.Boolean", false, "Z", "boolean");
  this.createPrimitiveType("scala.Char", 0, "C", "char");
  this.createPrimitiveType("scala.Byte", 0, "B", "byte");
  this.createPrimitiveType("scala.Short", 0, "S", "short");
  this.createPrimitiveType("scala.Int", 0, "I", "int");
  this.createPrimitiveType("scala.Long", 0, "J", "long");
  this.createPrimitiveType("scala.Float", 0.0, "F", "float");
  this.createPrimitiveType("scala.Double", 0.0, "D", "double");

  // Create dummy class for java.lang.String

  this.registerClass("java.lang.String", function($) {
    function StringClass() {
      throw "The pseudo StringClass constructor should never be called"
    }

    $.createClass("java.lang.String", StringClass, undefined, "java.lang.Object", {
      "java.lang.Object": true,
      "java.lang.String": true
    });
  });

  // Array type factory

  this.createArrayTypeFunction = function(name, componentData) {
    var ObjectClass = this.c["java.lang.Object"];
    var mangledName = componentData.name + "[]";

    function ArrayClass(arg) {
      ObjectClass.call(this);
      ObjectClass.prototype["<init>()"].call(this);

      if (typeof(arg) === "number") {
        // arg is the length of the array
        this.underlying = new Array(arg);
        zero = componentData.zero;
        for (var i = 0; i < arg; i++)
          this.underlying[i] = zero;
      } else {
        // arg is a native array that we wrap
        this.underlying = arg;
      }
    }
    ArrayClass.prototype = Object.create(ObjectClass.prototype);
    ArrayClass.prototype.constructor = ArrayClass;

    return ArrayClass;
  }

  // Runtime functions

  this.isScalaJSObject = function(instance) {
    return (typeof(instance) === "object") && (instance !== null) &&
      !!instance.$classData;
  }

  var StringAncestors = {
    "java.lang.String": true,
    "java.io.Serializable": true,
    "java.lang.CharSequence": true,
    "java.lang.Comparable": true,
    "java.lang.Object": true
  };

  this.isInstance = function(instance, classFullName) {
    if (this.isScalaJSObject(instance)) {
      return !!instance.$classData.ancestors[classFullName];
    } else if (typeof(instance) === "string") {
      return !!StringAncestors[classFullName];
    } else {
      return false;
    }
  };

  this.asInstance = function(instance, classFullName) {
    if ((instance === null) || this.isInstance(instance, classFullName))
      return instance;
    else
      this.throwClassCastException(instance, classFullName);
  };

  this.asInstanceString = function(instance) {
    if ((instance === null) || (typeof(instance) === "string"))
      return instance;
    else
      this.throwClassCastException(instance, "java.lang.String");
  };

  this.throwClassCastException = function(instance, classFullName) {
    throw new this.c["java.lang.ClassCastException"]()["<init>(T)"](
      instance + " is not an instance of " + classFullName);
  }

  this.makeNativeArrayWrapper = function(arrayClassData, nativeArray) {
    return new arrayClassData.constructor(nativeArray);
  }

  this.newArrayObject = function(arrayClassData, lengths) {
    return this.newArrayObjectInternal(arrayClassData, lengths, 0);
  };

  this.newArrayObjectInternal = function(arrayClassData, lengths, lengthIndex) {
    var result = new arrayClassData.constructor(lengths[lengthIndex]);

    if (lengthIndex < lengths.length-1) {
      var subArrayClassData = arrayClassData.componentData;
      var subLengthIndex = lengthIndex+1;
      for (var i = 0; i < result.length(); i++) {
        result.set(i, this.newArrayObjectInternal(
          subArrayClassData, lengths, subLengthIndex));
      }
    }

    return result;
  };

  this.anyEqEq = function(lhs, rhs) {
    if (this.isScalaJSObject(lhs)) {
      return this.m["scala.runtime.BoxesRunTime"]["equals(OO)Z"](lhs, rhs);
    } else {
      return lhs === rhs;
    }
  }

  this.anyRefEqEq = function(lhs, rhs) {
    if (this.isScalaJSObject(lhs))
      return lhs["equals(O)Z"](rhs);
    else
      return lhs === rhs;
  }

  this.objectGetClass = function(instance) {
    if (this.isScalaJSObject(instance) || (instance === null))
      return instance["getClass()Ljava.lang.Class;"]();
    else if (typeof(instance) === "string")
      return this.classes["java.lang.String"].cls;
    else
      return null; // Exception?
  }

  this.objectClone = function(instance) {
    // TODO
    throw new this.c["scala.NotImplementedError"]()["<init>()"]();
  }

  this.objectFinalize = function(instance) {
    // TODO?
  }

  this.objectNotify = function(instance) {
    // TODO?
  }

  this.objectNotifyAll = function(instance) {
    // TODO?
  }

  this.objectEquals = function(instance, rhs) {
    if (this.isScalaJSObject(instance) || (instance === null))
      return instance["equals(O)Z"]();
    else
      return instance === rhs;
  }

  this.objectHashCode = function(instance) {
    if (this.isScalaJSObject(instance))
      return instance["hashCode()I"]();
    else
      return 42; // TODO
  }

  this.truncateToLong = function(value) {
    return value < 0 ? Math.ceil(value) : Math.floor(value);
  }

  // Boxes - inline all the way through java.lang.X.valueOf()

  this.bV = function() {
    return this.m["scala.runtime.BoxedUnit"].$jsfield$UNIT;
  }
  this.bZ = function(value) {
    if (value)
      return this.m["java.lang.Boolean"].$jsfield$TRUE;
    else
      return this.m["java.lang.Boolean"].$jsfield$FALSE;
  }
  this.bC = function(value) {
    return new this.c["java.lang.Character"]()["<init>(C)"](value);
  }
  this.bB = function(value) {
    return new this.c["java.lang.Byte"]()["<init>(B)"](value);
  }
  this.bS = function(value) {
    return new this.c["java.lang.Short"]()["<init>(S)"](value);
  }
  this.bI = function(value) {
    return new this.c["java.lang.Integer"]()["<init>(I)"](value);
  }
  this.bJ = function(value) {
    return new this.c["java.lang.Long"]()["<init>(J)"](value);
  }
  this.bF = function(value) {
    return new this.c["java.lang.Float"]()["<init>(F)"](value);
  }
  this.bD = function(value) {
    return new this.c["java.lang.Double"]()["<init>(D)"](value);
  }

  // Unboxes - inline all the way through obj.xValue()

  this.uV = function(value) {
    return undefined;
  }
  this.uZ = function(value) {
    return this.asInstance(value, "java.lang.Boolean").$jsfield$value;
  }
  this.uC = function(value) {
    return this.asInstance(value, "java.lang.Character").$jsfield$value;
  }
  this.uB = function(value) {
    return this.asInstance(value, "java.lang.Byte").$jsfield$value;
  }
  this.uS = function(value) {
    return this.asInstance(value, "java.lang.Short").$jsfield$value;
  }
  this.uI = function(value) {
    return this.asInstance(value, "java.lang.Integer").$jsfield$value;
  }
  this.uJ = function(value) {
    return this.asInstance(value, "java.lang.Long").$jsfield$value;
  }
  this.uF = function(value) {
    return this.asInstance(value, "java.lang.Float").$jsfield$value;
  }
  this.uD = function(value) {
    return this.asInstance(value, "java.lang.Double").$jsfield$value;
  }
}

var $ScalaJSEnvironment = new $ScalaJSEnvironmentClass(this);
/* ------------------
 * java.lang.Object
 * ------------------ */

(function ($env) {
  $env.registerClass("java.lang.Object", function($env) {
    function ObjectClass() {
    }
    ObjectClass.prototype.constructor = ObjectClass;

    ObjectClass.prototype["<init>()"] = function() {
      return this;
    }

    ObjectClass.prototype["getClass()Ljava.lang.Class;"] = function() {
      return this.$classData.cls;
    }

    // Bridge for getClass()
    ObjectClass.prototype.getClass = function() {
      return this["getClass()Ljava.lang.Class;"]();
    }

    ObjectClass.prototype["hashCode()I"] = function() {
      // TODO
      return 42;
    }

    // Bridge for hashCode()
    ObjectClass.prototype.hashCode = function() {
      return this["hashCode()I"]();
    }

    ObjectClass.prototype["equals(O)Z"] = function(rhs) {
      return this === rhs;
    }

    // Bridge for equals(Object)
    ObjectClass.prototype.equals = function(that) {
      return this["equals(O)Z"](that);
    }

    ObjectClass.prototype["clone()O"] = function() {
      if ($env.isInstance(this, "java.lang.Cloneable")) {
        throw new this.classes["scala.NotImplementedError"].jsconstructor();
      } else {
        throw new this.classes["java.lang.CloneNotSupportedException"].jsconstructor();
      }
    }

    // Bridge for clone()
    ObjectClass.prototype.clone = function() {
      return this["clone()O"]();
    }

    ObjectClass.prototype["toString()T"] = function() {
      // getClass().getName() + "@" + Integer.toHexString(hashCode())
      var className = this["getClass()Ljava.lang.Class;"]()["getName()T"]();
      var hashCode = this["hashCode()I"]();
      return className + '@' + hashCode.toString(16);
    }

    // Bridge for toString()
    ObjectClass.prototype.toString = function() {
      return this["toString()T"]();
    }

    ObjectClass.prototype["notify()V"] = function() {}
    ObjectClass.prototype["notifyAll()V"] = function() {}
    ObjectClass.prototype["wait(J)V"] = function() {}
    ObjectClass.prototype["wait(JI)V"] = function() {}
    ObjectClass.prototype["wait()V"] = function() {}

    ObjectClass.prototype["finalize()V"] = function() {}

    // Constructor bridge
    function JSObjectClass() {
      ObjectClass.call(this);
      return this["<init>()"]();
    }
    JSObjectClass.prototype = ObjectClass.prototype;

    $env.createClass("java.lang.Object", ObjectClass, JSObjectClass, null, {
      "java.lang.Object": true
    });
  });
})($ScalaJSEnvironment);
/* ------------------
 * Ref types in scala.runtime._
 * ------------------ */

(function ($env) {
  function registerRefType(elemShortName, elemCodeName, isVolatile, zero) {
    var isObject = elemShortName === "Object";
    var name = "scala.runtime." +
      (isVolatile ? "Volatile" : "") + elemShortName + "Ref";
    var constructorName = "<init>("+elemCodeName+")";

    $env.registerClass(name, function($env) {
      var ObjectClass = $env.c["java.lang.Object"];

      function Class() {
        ObjectClass.prototype.constructor.call(this);
        this.$jsfield$elem = zero;
      }
      Class.prototype = Object.create(ObjectClass.prototype);
      Class.prototype.constructor = Class;

      Class.prototype[constructorName] = function(elem) {
        ObjectClass.prototype["<init>()"].call(this);
        this.$jsfield$elem = elem;
        return this;
      }

      Class.prototype["toString():java.lang.String"] = function() {
        return this.$jsfield$elem.toString();
      }

      function JSClass(elem) {
        Class.call(this);
        return this[constructorName](elem);
      }
      JSClass.prototype = Class.prototype;

      var ancestors = {
        "java.io.Serializable": true,
        "java.lang.Object": true
      };
      ancestors[name] = true;

      $env.createClass(name, Class, JSClass, "java.lang.Object", ancestors);
    });
  }

  for (var volat = 0; volat < 2; volat++) {
    var isVolatile = volat != 0;
    registerRefType("Boolean", "Z", isVolatile, false);
    registerRefType("Char", "C", isVolatile, 0);
    registerRefType("Byte", "B", isVolatile, 0);
    registerRefType("Short", "S", isVolatile, 0);
    registerRefType("Int", "I", isVolatile, 0);
    registerRefType("Long", "J", isVolatile, 0);
    registerRefType("Float", "F", isVolatile, 0.0);
    registerRefType("Double", "D", isVolatile, 0.0);
    registerRefType("Object", "O", isVolatile, null);
  }
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("java.io.Serializable", {
    "java.io.Serializable": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.io.FilterOutputStream", (function($) {
    function Class() {
      $.c["java.io.OutputStream"].prototype.constructor.call(this);
      this.$jsfield$out = null
    };
    Class.prototype = Object.create($.c["java.io.OutputStream"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["close()V"] = (function() {
      this.$jsfield$out["close()V"]()
    });
    Class.prototype["flush()V"] = (function() {
      this.$jsfield$out["flush()V"]()
    });
    Class.prototype["write(I)V"] = (function(arg$b) {
      this.$jsfield$out["write(I)V"](arg$b)
    });
    Class.prototype["<init>(Ljava.io.OutputStream;)"] = (function(arg$out) {
      this.$jsfield$out = arg$out;
      $.c["java.io.OutputStream"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(Ljava.io.OutputStream;)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.io.FilterOutputStream", Class, JSClass, "java.io.OutputStream", {
      "java.io.FilterOutputStream": true,
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("java.io.Flushable", {
    "java.io.Flushable": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("java.io.Appendable", {
    "java.io.Appendable": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.io.OutputStream", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["close()V"] = (function() {
      /*<skip>*/
    });
    Class.prototype["flush()V"] = (function() {
      /*<skip>*/
    });
    Class.prototype["write([B)V"] = (function(arg$b) {
      this["write([BII)V"](arg$b, 0, arg$b.underlying.length)
    });
    Class.prototype["write([BII)V"] = (function(arg$b, arg$off, arg$len) {
      var n$jsid$21707 = arg$off;
      var stop$jsid$21708 = (arg$off + arg$len);
      while ((n$jsid$21707 < stop$jsid$21708)) {
        this["write(I)V"](arg$b.underlying[n$jsid$21707]);
        n$jsid$21707 = (n$jsid$21707 + 1)
      }
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.write = (function(arg$1, arg$2, arg$3) {
      switch (arguments.length) {
        case 1:
          if ((typeof(arg$1) === "number")) {
            return this["write(I)V"](arg$1)
          } else {
            if ($.isInstance(arg$1, "scala.Byte[]")) {
              return this["write([B)V"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 3:
          return this["write([BII)V"](arg$1, arg$2, arg$3);
        default:
          throw "No matching overload";
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.io.OutputStream", Class, JSClass, "java.lang.Object", {
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("java.io.Closeable", {
    "java.io.Closeable": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.io.PrintStream", (function($) {
    function Class() {
      $.c["java.io.FilterOutputStream"].prototype.constructor.call(this);
      this.$jsfield$_out = null;
      this.$jsfield$autoFlush = false;
      this.$jsfield$hasError = false
    };
    Class.prototype = Object.create($.c["java.io.FilterOutputStream"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["write(I)V"] = (function(arg$b) {
      this.$jsfield$_out["write(I)V"](arg$b);
      if ((this.$jsfield$autoFlush && (arg$b === 10))) {
        this["flush()V"]()
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["append(C)Ljava.io.PrintStream;"] = (function(arg$c) {
      return this
    });
    Class.prototype["append(Ljava.lang.CharSequence;)Ljava.io.PrintStream;"] = (function(arg$csq) {
      return this
    });
    Class.prototype["append(Ljava.lang.CharSequence;II)Ljava.io.PrintStream;"] = (function(arg$csq, arg$start, arg$end) {
      return this
    });
    Class.prototype["hasError()Z"] = (function() {
      return this.$jsfield$hasError
    });
    Class.prototype["hasError_=(Z)V"] = (function(arg$x$1) {
      this.$jsfield$hasError = arg$x$1
    });
    Class.prototype["checkError()Z"] = (function() {
      return this["hasError()Z"]()
    });
    Class.prototype["setError()V"] = (function() {
      this["hasError_=(Z)V"](true)
    });
    Class.prototype["clearError()V"] = (function() {
      this["hasError_=(Z)V"](false)
    });
    Class.prototype["print(Z)V"] = (function(arg$b) {
      this["print(T)V"]($.bZ(arg$b).toString())
    });
    Class.prototype["print(C)V"] = (function(arg$c) {
      this["print(T)V"]($.bC(arg$c).toString())
    });
    Class.prototype["print(I)V"] = (function(arg$i) {
      this["print(T)V"]($.bI(arg$i).toString())
    });
    Class.prototype["print(J)V"] = (function(arg$l) {
      this["print(T)V"]($.bJ(arg$l).toString())
    });
    Class.prototype["print(F)V"] = (function(arg$f) {
      this["print(T)V"]($.bF(arg$f).toString())
    });
    Class.prototype["print(D)V"] = (function(arg$d) {
      this["print(T)V"]($.bD(arg$d).toString())
    });
    Class.prototype["print([C)V"] = (function(arg$s) {
      this["print(T)V"]("character array")
    });
    Class.prototype["print(T)V"] = (function(arg$s) {
      if ((arg$s === null)) {
        this["print(T)V"]("null")
      } else {
        this["writeString(T)V"](arg$s)
      }
    });
    Class.prototype["print(O)V"] = (function(arg$o) {
      if ((arg$o === null)) {
        this["print(T)V"]("null")
      } else {
        this["print(T)V"](arg$o.toString())
      }
    });
    Class.prototype["writeString(T)V"] = (function(arg$s) {
      var bytes$jsid$20510 = $.newArrayObject($.primitives["scala.Byte"].array, [arg$s.length]);
      var jsx$1 = $.m["scala.runtime.RichInt"]["until$extension0(II)Lscala.collection.immutable.Range;"]($.m["scala.Predef"]["intWrapper(I)I"](0), arg$s.length);
      var jsx$2 = new $.c["java.io.PrintStream$$anonfun$writeString$1"]()["<init>(Ljava.io.PrintStream;T[B)"](this, arg$s, bytes$jsid$20510);
      jsx$1["foreach$mVc$sp(Lscala.Function1;)V"](jsx$2);
      this["write([B)V"](bytes$jsid$20510)
    });
    Class.prototype["println()V"] = (function() {
      this["write(I)V"](10)
    });
    Class.prototype["println(Z)V"] = (function(arg$x) {
      this["print(Z)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(C)V"] = (function(arg$x) {
      this["print(C)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(I)V"] = (function(arg$x) {
      this["print(I)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(J)V"] = (function(arg$x) {
      this["print(J)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(F)V"] = (function(arg$x) {
      this["print(F)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(D)V"] = (function(arg$x) {
      this["print(D)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(T)V"] = (function(arg$x) {
      this["print(T)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["println(O)V"] = (function(arg$x) {
      this["print(O)V"](arg$x);
      this["println()V"]()
    });
    Class.prototype["printf(T[O)V"] = (function(arg$format, arg$args) {
      this["print(T)V"]("printf")
    });
    Class.prototype["printf(Ljava.util.Locale;T[O)V"] = (function(arg$l, arg$format, arg$args) {
      this["print(T)V"]("printf")
    });
    Class.prototype["format(T[O)V"] = (function(arg$format, arg$args) {
      this["print(T)V"]("printf")
    });
    Class.prototype["format(Ljava.util.Locale;T[O)V"] = (function(arg$l, arg$format, arg$args) {
      this["print(T)V"]("printf")
    });
    Class.prototype["append(Ljava.lang.CharSequence;II)Ljava.io.Appendable;"] = (function(arg$csq, arg$start, arg$end) {
      return this["append(Ljava.lang.CharSequence;II)Ljava.io.PrintStream;"](arg$csq, arg$start, arg$end)
    });
    Class.prototype["append(Ljava.lang.CharSequence;)Ljava.io.Appendable;"] = (function(arg$csq) {
      return this["append(Ljava.lang.CharSequence;)Ljava.io.PrintStream;"](arg$csq)
    });
    Class.prototype["append(C)Ljava.io.Appendable;"] = (function(arg$c) {
      return this["append(C)Ljava.io.PrintStream;"](arg$c)
    });
    Class.prototype["<init>(Ljava.io.OutputStream;ZT)"] = (function(arg$_out, arg$autoFlush, arg$ecoding) {
      this.$jsfield$_out = arg$_out;
      this.$jsfield$autoFlush = arg$autoFlush;
      $.c["java.io.FilterOutputStream"].prototype["<init>(Ljava.io.OutputStream;)"].call(this, arg$_out);
      this.$jsfield$hasError = false;
      return this
    });
    Class.prototype["<init>(Ljava.io.OutputStream;)"] = (function(arg$out) {
      this["<init>(Ljava.io.OutputStream;ZT)"](arg$out, false, "");
      return this
    });
    Class.prototype["<init>(Ljava.io.OutputStream;Z)"] = (function(arg$out, arg$autoFlush) {
      this["<init>(Ljava.io.OutputStream;ZT)"](arg$out, arg$autoFlush, "");
      return this
    });
    Class.prototype.append = (function(arg$1, arg$2, arg$3) {
      switch (arguments.length) {
        case 1:
          if ((typeof(arg$1) === "number")) {
            return this["append(C)Ljava.io.PrintStream;"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.CharSequence")) {
              return this["append(Ljava.lang.CharSequence;)Ljava.io.PrintStream;"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 3:
          return this["append(Ljava.lang.CharSequence;II)Ljava.io.PrintStream;"](arg$1, arg$2, arg$3);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.hasError = (function() {
      return this["hasError()Z"]()
    });
    Class.prototype["hasError_="] = (function(arg$1) {
      return this["hasError_=(Z)V"](arg$1)
    });
    Class.prototype.checkError = (function() {
      return this["checkError()Z"]()
    });
    Class.prototype.setError = (function() {
      return this["setError()V"]()
    });
    Class.prototype.clearError = (function() {
      return this["clearError()V"]()
    });
    Class.prototype.print = (function(arg$1) {
      if ((typeof(arg$1) === "boolean")) {
        return this["print(Z)V"](arg$1)
      } else {
        if ((typeof(arg$1) === "number")) {
          return this["print(C)V"](arg$1);
          return this["print(I)V"](arg$1);
          return this["print(J)V"](arg$1);
          return this["print(F)V"](arg$1);
          return this["print(D)V"](arg$1)
        } else {
          if ((typeof(arg$1) === "string")) {
            return this["print(T)V"](arg$1)
          } else {
            if ($.isInstance(arg$1, "scala.Char[]")) {
              return this["print([C)V"](arg$1)
            } else {
              if ($.isInstance(arg$1, "java.lang.Object")) {
                return this["print(O)V"](arg$1)
              } else {
                throw "No matching overload"
              }
            }
          }
        }
      }
    });
    Class.prototype.println = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["println()V"]();
        case 1:
          if ((typeof(arg$1) === "boolean")) {
            return this["println(Z)V"](arg$1)
          } else {
            if ((typeof(arg$1) === "number")) {
              return this["println(C)V"](arg$1);
              return this["println(I)V"](arg$1);
              return this["println(J)V"](arg$1);
              return this["println(F)V"](arg$1);
              return this["println(D)V"](arg$1)
            } else {
              if ((typeof(arg$1) === "string")) {
                return this["println(T)V"](arg$1)
              } else {
                if ($.isInstance(arg$1, "java.lang.Object")) {
                  return this["println(O)V"](arg$1)
                } else {
                  throw "No matching overload"
                }
              }
            }
          };
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.printf = (function(arg$1, arg$2, arg$3) {
      switch (arguments.length) {
        case 2:
          return this["printf(T[O)V"](arg$1, arg$2);
        case 3:
          return this["printf(Ljava.util.Locale;T[O)V"](arg$1, arg$2, arg$3);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.format = (function(arg$1, arg$2, arg$3) {
      switch (arguments.length) {
        case 2:
          return this["format(T[O)V"](arg$1, arg$2);
        case 3:
          return this["format(Ljava.util.Locale;T[O)V"](arg$1, arg$2, arg$3);
        default:
          throw "No matching overload";
      }
    });
    function JSClass(arg$1, arg$2, arg$3) {
      Class.call(this);
      switch (arguments.length) {
        case 1:
          return this["<init>(Ljava.io.OutputStream;)"](arg$1);
        case 2:
          return this["<init>(Ljava.io.OutputStream;Z)"](arg$1, arg$2);
        case 3:
          return this["<init>(Ljava.io.OutputStream;ZT)"](arg$1, arg$2, arg$3);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.io.PrintStream", Class, JSClass, "java.io.FilterOutputStream", {
      "java.io.PrintStream": true,
      "java.io.Appendable": true,
      "java.io.FilterOutputStream": true,
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.io.PrintStream$$anonfun$writeString$1", (function($) {
    function Class() {
      $.c["scala.runtime.AbstractFunction1$mcVI$sp"].prototype.constructor.call(this);
      this.$jsfield$s$1 = null;
      this.$jsfield$bytes$1 = null
    };
    Class.prototype = Object.create($.c["scala.runtime.AbstractFunction1$mcVI$sp"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(I)V"] = (function(arg$i) {
      this["apply$mcVI$sp(I)V"](arg$i)
    });
    Class.prototype["apply$mcVI$sp(I)V"] = (function(arg$i) {
      this.$jsfield$bytes$1.underlying[arg$i] = this.$jsfield$s$1.charCodeAt(arg$i)
    });
    Class.prototype["apply(O)O"] = (function(arg$v1) {
      this["apply(I)V"]($.uI(arg$v1));
      return $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]()
    });
    Class.prototype["<init>(Ljava.io.PrintStream;T[B)"] = (function(arg$$outer, arg$s$1, arg$bytes$1) {
      this.$jsfield$s$1 = arg$s$1;
      this.$jsfield$bytes$1 = arg$bytes$1;
      $.c["scala.runtime.AbstractFunction1$mcVI$sp"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass(arg$1, arg$2, arg$3) {
      Class.call(this);
      return this["<init>(Ljava.io.PrintStream;T[B)"](arg$1, arg$2, arg$3)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.io.PrintStream$$anonfun$writeString$1", Class, JSClass, "scala.runtime.AbstractFunction1$mcVI$sp", {
      "java.io.PrintStream$$anonfun$writeString$1": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.runtime.AbstractFunction1$mcVI$sp": true,
      "scala.Function1$mcVI$sp": true,
      "scala.runtime.AbstractFunction1": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Long", (function($) {
    function Class() {
      $.c["java.lang.Number"].prototype.constructor.call(this);
      this.$jsfield$value = 0;
      this.$jsfield$isInt = false
    };
    Class.prototype = Object.create($.c["java.lang.Number"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()J"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["isInt()Z"] = (function() {
      return this.$jsfield$isInt
    });
    Class.prototype["byteValue()B"] = (function() {
      return this["value()J"]()
    });
    Class.prototype["shortValue()S"] = (function() {
      return this["value()J"]()
    });
    Class.prototype["intValue()I"] = (function() {
      return this["value()J"]()
    });
    Class.prototype["longValue()J"] = (function() {
      return this["value()J"]()
    });
    Class.prototype["floatValue()F"] = (function() {
      return this["value()J"]()
    });
    Class.prototype["doubleValue()D"] = (function() {
      return this["value()J"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Long") && (this["value()J"]() === $.asInstance(arg$that, "java.lang.Long")["value()J"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return this["value()J"]().toString()
    });
    Class.prototype["<init>(J)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Number"].prototype["<init>()"].call(this);
      this.$jsfield$isInt = true;
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(J)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Long", Class, JSClass, "java.lang.Number", {
      "java.lang.Long": true,
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Long$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$MIN_VALUE = 0;
      this.$jsfield$MAX_VALUE = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["MIN_VALUE()J"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_VALUE()J"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["valueOf(J)Ljava.lang.Long;"] = (function(arg$longValue) {
      return new $.c["java.lang.Long"]()["<init>(J)"](arg$longValue)
    });
    Class.prototype["parseLong(T)J"] = (function(arg$s) {
      return $.m["java.lang.Integer"]["parseInt(T)I"](arg$s)
    });
    Class.prototype["toString(J)T"] = (function(arg$l) {
      return $.m["java.lang.Integer"]["valueOf(I)Ljava.lang.Integer;"](arg$l)["toString()T"]()
    });
    Class.prototype["bitCount(J)J"] = (function(arg$i) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["reverseBytes(J)J"] = (function(arg$i) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["rotateLeft(JI)J"] = (function(arg$i, arg$distance) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["rotateRight(JI)J"] = (function(arg$i, arg$distance) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toBinaryString(J)T"] = (function(arg$l) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toHexString(J)T"] = (function(arg$l) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toOctalString(J)T"] = (function(arg$l) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Long"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Long"].cls;
      this.$jsfield$MIN_VALUE = -9223372036854775808;
      this.$jsfield$MAX_VALUE = 9223372036854775807;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()J"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()J"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(J)Ljava.lang.Long;"](arg$1)
    });
    Class.prototype.parseLong = (function(arg$1) {
      return this["parseLong(T)J"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(J)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.bitCount = (function(arg$1) {
      return this["bitCount(J)J"](arg$1)
    });
    Class.prototype.reverseBytes = (function(arg$1) {
      return this["reverseBytes(J)J"](arg$1)
    });
    Class.prototype.rotateLeft = (function(arg$1, arg$2) {
      return this["rotateLeft(JI)J"](arg$1, arg$2)
    });
    Class.prototype.rotateRight = (function(arg$1, arg$2) {
      return this["rotateRight(JI)J"](arg$1, arg$2)
    });
    Class.prototype.toBinaryString = (function(arg$1) {
      return this["toBinaryString(J)T"](arg$1)
    });
    Class.prototype.toHexString = (function(arg$1) {
      return this["toHexString(J)T"](arg$1)
    });
    Class.prototype.toOctalString = (function(arg$1) {
      return this["toOctalString(J)T"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Long$", Class, JSClass, "java.lang.Object", {
      "java.lang.Long$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Long", "java.lang.Long$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.InheritableThreadLocal", (function($) {
    function Class() {
      $.c["java.lang.ThreadLocal"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.ThreadLocal"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.ThreadLocal"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.InheritableThreadLocal", Class, JSClass, "java.lang.ThreadLocal", {
      "java.lang.InheritableThreadLocal": true,
      "java.lang.ThreadLocal": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Exception", (function($) {
    function Class() {
      $.c["java.lang.Throwable"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Throwable"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.Throwable"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Exception", Class, JSClass, "java.lang.Throwable", {
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.StandardOutPrintStream$", (function($) {
    function Class() {
      $.c["java.io.PrintStream"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.io.PrintStream"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["writeString(T)V"] = (function(arg$s) {
      if (($.g.console && (arg$s !== "\n"))) {
        $.g.console.log(arg$s)
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.io.PrintStream"].prototype["<init>(Ljava.io.OutputStream;Z)"].call(this, $.m["java.lang.StandardOut"], true);
      $.modules["java.lang.StandardOutPrintStream"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.StandardOutPrintStream$", Class, JSClass, "java.io.PrintStream", {
      "java.lang.StandardOutPrintStream$": true,
      "java.io.PrintStream": true,
      "java.io.Appendable": true,
      "java.io.FilterOutputStream": true,
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.StandardOutPrintStream", "java.lang.StandardOutPrintStream$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.RuntimeException", (function($) {
    function Class() {
      $.c["java.lang.Exception"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Exception"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.Exception"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.RuntimeException", Class, JSClass, "java.lang.Exception", {
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.SecurityException", (function($) {
    function Class() {
      $.c["java.lang.RuntimeException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.RuntimeException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.RuntimeException"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.SecurityException", Class, JSClass, "java.lang.RuntimeException", {
      "java.lang.SecurityException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.StringBuilder", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$content = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["content()T"] = (function() {
      return this.$jsfield$content
    });
    Class.prototype["content_=(T)V"] = (function(arg$x$1) {
      this.$jsfield$content = arg$x$1
    });
    Class.prototype["append(T)Ljava.lang.StringBuilder;"] = (function(arg$s) {
      this["content_=(T)V"]((this["content()T"]() + arg$s));
      return this
    });
    Class.prototype["append(Ljava.lang.Boolean;)Ljava.lang.StringBuilder;"] = (function(arg$b) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$b["toString()T"]())
    });
    Class.prototype["append(C)Ljava.lang.StringBuilder;"] = (function(arg$c) {
      return this["append(T)Ljava.lang.StringBuilder;"]($.bC(arg$c).toString())
    });
    Class.prototype["append(Ljava.lang.Byte;)Ljava.lang.StringBuilder;"] = (function(arg$b) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$b["toString()T"]())
    });
    Class.prototype["append(Ljava.lang.Short;)Ljava.lang.StringBuilder;"] = (function(arg$s) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$s["toString()T"]())
    });
    Class.prototype["append(I)Ljava.lang.StringBuilder;"] = (function(arg$i) {
      return this["append(T)Ljava.lang.StringBuilder;"]($.bI(arg$i).toString())
    });
    Class.prototype["append(Ljava.lang.Long;)Ljava.lang.StringBuilder;"] = (function(arg$lng) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$lng["toString()T"]())
    });
    Class.prototype["append(Ljava.lang.Float;)Ljava.lang.StringBuilder;"] = (function(arg$f) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$f["toString()T"]())
    });
    Class.prototype["append(Ljava.lang.Double;)Ljava.lang.StringBuilder;"] = (function(arg$d) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$d["toString()T"]())
    });
    Class.prototype["append(O)Ljava.lang.StringBuilder;"] = (function(arg$obj) {
      return this["append(T)Ljava.lang.StringBuilder;"](arg$obj.toString())
    });
    Class.prototype["toString()T"] = (function() {
      return this["content()T"]()
    });
    Class.prototype["length()I"] = (function() {
      return this["content()T"]().length
    });
    Class.prototype["charAt(I)C"] = (function(arg$index) {
      return this["content()T"]().charCodeAt(arg$index)
    });
    Class.prototype["codePointAt(I)I"] = (function(arg$index) {
      return this["content()T"]().charCodeAt(arg$index)
    });
    Class.prototype["<init>(T)"] = (function(arg$content) {
      this.$jsfield$content = arg$content;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"]("");
      return this
    });
    Class.prototype["<init>(I)"] = (function(arg$initialCapacity) {
      this["<init>(T)"]("");
      return this
    });
    Class.prototype.content = (function() {
      return this["content()T"]()
    });
    Class.prototype["content_="] = (function(arg$1) {
      return this["content_=(T)V"](arg$1)
    });
    Class.prototype.append = (function(arg$1) {
      if ((typeof(arg$1) === "number")) {
        return this["append(C)Ljava.lang.StringBuilder;"](arg$1);
        return this["append(I)Ljava.lang.StringBuilder;"](arg$1)
      } else {
        if ((typeof(arg$1) === "string")) {
          return this["append(T)Ljava.lang.StringBuilder;"](arg$1)
        } else {
          if ($.isInstance(arg$1, "java.lang.Boolean")) {
            return this["append(Ljava.lang.Boolean;)Ljava.lang.StringBuilder;"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Byte")) {
              return this["append(Ljava.lang.Byte;)Ljava.lang.StringBuilder;"](arg$1)
            } else {
              if ($.isInstance(arg$1, "java.lang.Short")) {
                return this["append(Ljava.lang.Short;)Ljava.lang.StringBuilder;"](arg$1)
              } else {
                if ($.isInstance(arg$1, "java.lang.Long")) {
                  return this["append(Ljava.lang.Long;)Ljava.lang.StringBuilder;"](arg$1)
                } else {
                  if ($.isInstance(arg$1, "java.lang.Float")) {
                    return this["append(Ljava.lang.Float;)Ljava.lang.StringBuilder;"](arg$1)
                  } else {
                    if ($.isInstance(arg$1, "java.lang.Double")) {
                      return this["append(Ljava.lang.Double;)Ljava.lang.StringBuilder;"](arg$1)
                    } else {
                      if ($.isInstance(arg$1, "java.lang.Object")) {
                        return this["append(O)Ljava.lang.StringBuilder;"](arg$1)
                      } else {
                        throw "No matching overload"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    Class.prototype.length = (function() {
      return this["length()I"]()
    });
    Class.prototype.charAt = (function(arg$1) {
      return this["charAt(I)C"](arg$1)
    });
    Class.prototype.codePointAt = (function(arg$1) {
      return this["codePointAt(I)I"](arg$1)
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "number")) {
            return this["<init>(I)"](arg$1)
          } else {
            if ((typeof(arg$1) === "string")) {
              return this["<init>(T)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.StringBuilder", Class, JSClass, "java.lang.Object", {
      "java.lang.StringBuilder": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.StandardErrPrintStream$", (function($) {
    function Class() {
      $.c["java.io.PrintStream"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.io.PrintStream"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["writeString(T)V"] = (function(arg$s) {
      if (($.g.console && (arg$s !== "\n"))) {
        $.g.console.error(arg$s)
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.io.PrintStream"].prototype["<init>(Ljava.io.OutputStream;Z)"].call(this, $.m["java.lang.StandardErr"], true);
      $.modules["java.lang.StandardErrPrintStream"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.StandardErrPrintStream$", Class, JSClass, "java.io.PrintStream", {
      "java.lang.StandardErrPrintStream$": true,
      "java.io.PrintStream": true,
      "java.io.Appendable": true,
      "java.io.FilterOutputStream": true,
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.StandardErrPrintStream", "java.lang.StandardErrPrintStream$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Double", (function($) {
    function Class() {
      $.c["java.lang.Number"].prototype.constructor.call(this);
      this.$jsfield$value = 0.0;
      this.$jsfield$isInt = false
    };
    Class.prototype = Object.create($.c["java.lang.Number"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()D"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["isInt()Z"] = (function() {
      return this.$jsfield$isInt
    });
    Class.prototype["byteValue()B"] = (function() {
      return (this["value()D"]() | 0)
    });
    Class.prototype["shortValue()S"] = (function() {
      return (this["value()D"]() | 0)
    });
    Class.prototype["intValue()I"] = (function() {
      return (this["value()D"]() | 0)
    });
    Class.prototype["longValue()J"] = (function() {
      return $.truncateToLong(this["value()D"]())
    });
    Class.prototype["floatValue()F"] = (function() {
      return this["value()D"]()
    });
    Class.prototype["doubleValue()D"] = (function() {
      return this["value()D"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Double") && (this["value()D"]() === $.asInstance(arg$that, "java.lang.Double")["value()D"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return this["value()D"]().toString()
    });
    Class.prototype["isNaN()Z"] = (function() {
      return $.m["java.lang.Double"]["isNaN(D)Z"](this["value()D"]())
    });
    Class.prototype["<init>(D)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Number"].prototype["<init>()"].call(this);
      this.$jsfield$isInt = false;
      return this
    });
    Class.prototype.isNaN = (function() {
      return this["isNaN()Z"]()
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(D)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Double", Class, JSClass, "java.lang.Number", {
      "java.lang.Double": true,
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Double$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$POSITIVE_INFINITY = 0.0;
      this.$jsfield$NEGATIVE_INFINITY = 0.0;
      this.$jsfield$NaN = 0.0;
      this.$jsfield$MAX_VALUE = 0.0;
      this.$jsfield$MIN_NORMAL = 0.0;
      this.$jsfield$MIN_VALUE = 0.0;
      this.$jsfield$MAX_EXPONENT = 0;
      this.$jsfield$MIN_EXPONENT = 0;
      this.$jsfield$SIZE = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["POSITIVE_INFINITY()D"] = (function() {
      return this.$jsfield$POSITIVE_INFINITY
    });
    Class.prototype["NEGATIVE_INFINITY()D"] = (function() {
      return this.$jsfield$NEGATIVE_INFINITY
    });
    Class.prototype["NaN()D"] = (function() {
      return this.$jsfield$NaN
    });
    Class.prototype["MAX_VALUE()D"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["MIN_NORMAL()D"] = (function() {
      return this.$jsfield$MIN_NORMAL
    });
    Class.prototype["MIN_VALUE()D"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_EXPONENT()I"] = (function() {
      return this.$jsfield$MAX_EXPONENT
    });
    Class.prototype["MIN_EXPONENT()I"] = (function() {
      return this.$jsfield$MIN_EXPONENT
    });
    Class.prototype["SIZE()I"] = (function() {
      return this.$jsfield$SIZE
    });
    Class.prototype["valueOf(D)Ljava.lang.Double;"] = (function(arg$doubleValue) {
      return new $.c["java.lang.Double"]()["<init>(D)"](arg$doubleValue)
    });
    Class.prototype["parseDouble(T)D"] = (function(arg$s) {
      return $.m["java.lang.Float"]["parseFloat(T)F"](arg$s)
    });
    Class.prototype["toString(D)T"] = (function(arg$d) {
      return $.m["java.lang.Float"]["valueOf(F)Ljava.lang.Float;"](arg$d)["toString()T"]()
    });
    Class.prototype["compare(DD)I"] = (function(arg$a, arg$b) {
      if ((arg$a === arg$b)) {
        return 0
      } else {
        if ((arg$a < arg$b)) {
          return -1
        } else {
          return 1
        }
      }
    });
    Class.prototype["isNaN(D)Z"] = (function(arg$v) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isInfinite(D)Z"] = (function(arg$v) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["longBitsToDouble(J)D"] = (function(arg$bits) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["doubleToLongBits(D)J"] = (function(arg$value) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Double"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Double"].cls;
      this.$jsfield$POSITIVE_INFINITY = 0.0;
      this.$jsfield$NEGATIVE_INFINITY = 0.0;
      this.$jsfield$NaN = 0.0;
      this.$jsfield$MAX_VALUE = 0.0;
      this.$jsfield$MIN_NORMAL = 0.0;
      this.$jsfield$MIN_VALUE = 0.0;
      this.$jsfield$MAX_EXPONENT = 1023;
      this.$jsfield$MIN_EXPONENT = -1022;
      this.$jsfield$SIZE = 64;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.POSITIVE_INFINITY = (function() {
      return this["POSITIVE_INFINITY()D"]()
    });
    Class.prototype.NEGATIVE_INFINITY = (function() {
      return this["NEGATIVE_INFINITY()D"]()
    });
    Class.prototype.NaN = (function() {
      return this["NaN()D"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()D"]()
    });
    Class.prototype.MIN_NORMAL = (function() {
      return this["MIN_NORMAL()D"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()D"]()
    });
    Class.prototype.MAX_EXPONENT = (function() {
      return this["MAX_EXPONENT()I"]()
    });
    Class.prototype.MIN_EXPONENT = (function() {
      return this["MIN_EXPONENT()I"]()
    });
    Class.prototype.SIZE = (function() {
      return this["SIZE()I"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(D)Ljava.lang.Double;"](arg$1)
    });
    Class.prototype.parseDouble = (function(arg$1) {
      return this["parseDouble(T)D"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(D)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.compare = (function(arg$1, arg$2) {
      return this["compare(DD)I"](arg$1, arg$2)
    });
    Class.prototype.isNaN = (function(arg$1) {
      return this["isNaN(D)Z"](arg$1)
    });
    Class.prototype.isInfinite = (function(arg$1) {
      return this["isInfinite(D)Z"](arg$1)
    });
    Class.prototype.longBitsToDouble = (function(arg$1) {
      return this["longBitsToDouble(J)D"](arg$1)
    });
    Class.prototype.doubleToLongBits = (function(arg$1) {
      return this["doubleToLongBits(D)J"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Double$", Class, JSClass, "java.lang.Object", {
      "java.lang.Double$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Double", "java.lang.Double$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Runtime", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["exit(I)V"] = (function(arg$status) {
      this["halt0(I)V"](arg$status)
    });
    Class.prototype["addShutdownHook(Ljava.lang.Thread;)V"] = (function(arg$hook) {
      /*<skip>*/
    });
    Class.prototype["removeShutdownHook(Ljava.lang.Thread;)V"] = (function(arg$hook) {
      /*<skip>*/
    });
    Class.prototype["halt(I)V"] = (function(arg$status) {
      this["halt0(I)V"](arg$status)
    });
    Class.prototype["halt0(I)V"] = (function(arg$status) {
      throw new $.c["java.lang.SecurityException"]()["<init>(T)"]("Cannot terminate a JavaScript program")
    });
    Class.prototype["availableProcessors()I"] = (function() {
      return 1
    });
    Class.prototype["freeMemory()J"] = (function() {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("Runtime.freeMemory() not implemented")
    });
    Class.prototype["totalMemory()J"] = (function() {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("Runtime.totalMemory() not implemented")
    });
    Class.prototype["maxMemory()J"] = (function() {
      return $.m["java.lang.Long"]["MAX_VALUE()J"]()
    });
    Class.prototype["gc()V"] = (function() {
      /*<skip>*/
    });
    Class.prototype["runFinalization()V"] = (function() {
      /*<skip>*/
    });
    Class.prototype["traceInstructions(Z)V"] = (function(arg$on) {
      /*<skip>*/
    });
    Class.prototype["traceMethodCalls(Z)V"] = (function(arg$on) {
      /*<skip>*/
    });
    Class.prototype["load(T)V"] = (function(arg$filename) {
      $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("Runtime.load() not implemented")
    });
    Class.prototype["loadLibrary(T)V"] = (function(arg$filename) {
      $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("Runtime.loadLibrary() not implemented")
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.exit = (function(arg$1) {
      return this["exit(I)V"](arg$1)
    });
    Class.prototype.addShutdownHook = (function(arg$1) {
      return this["addShutdownHook(Ljava.lang.Thread;)V"](arg$1)
    });
    Class.prototype.removeShutdownHook = (function(arg$1) {
      return this["removeShutdownHook(Ljava.lang.Thread;)V"](arg$1)
    });
    Class.prototype.halt = (function(arg$1) {
      return this["halt(I)V"](arg$1)
    });
    Class.prototype.availableProcessors = (function() {
      return this["availableProcessors()I"]()
    });
    Class.prototype.freeMemory = (function() {
      return this["freeMemory()J"]()
    });
    Class.prototype.totalMemory = (function() {
      return this["totalMemory()J"]()
    });
    Class.prototype.maxMemory = (function() {
      return this["maxMemory()J"]()
    });
    Class.prototype.gc = (function() {
      return this["gc()V"]()
    });
    Class.prototype.runFinalization = (function() {
      return this["runFinalization()V"]()
    });
    Class.prototype.traceInstructions = (function(arg$1) {
      return this["traceInstructions(Z)V"](arg$1)
    });
    Class.prototype.traceMethodCalls = (function(arg$1) {
      return this["traceMethodCalls(Z)V"](arg$1)
    });
    Class.prototype.load = (function(arg$1) {
      return this["load(T)V"](arg$1)
    });
    Class.prototype.loadLibrary = (function(arg$1) {
      return this["loadLibrary(T)V"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Runtime", Class, JSClass, "java.lang.Object", {
      "java.lang.Runtime": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Runtime$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$currentRuntime = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["currentRuntime()Ljava.lang.Runtime;"] = (function() {
      return this.$jsfield$currentRuntime
    });
    Class.prototype["getRuntime()Ljava.lang.Runtime;"] = (function() {
      return this["currentRuntime()Ljava.lang.Runtime;"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Runtime"]._instance = this;
      this.$jsfield$currentRuntime = new $.c["java.lang.Runtime"]()["<init>()"]();
      return this
    });
    Class.prototype.getRuntime = (function() {
      return this["getRuntime()Ljava.lang.Runtime;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Runtime$", Class, JSClass, "java.lang.Object", {
      "java.lang.Runtime$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Runtime", "java.lang.Runtime$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Byte", (function($) {
    function Class() {
      $.c["java.lang.Number"].prototype.constructor.call(this);
      this.$jsfield$value = 0;
      this.$jsfield$isInt = false
    };
    Class.prototype = Object.create($.c["java.lang.Number"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()B"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["isInt()Z"] = (function() {
      return this.$jsfield$isInt
    });
    Class.prototype["byteValue()B"] = (function() {
      return this["value()B"]()
    });
    Class.prototype["shortValue()S"] = (function() {
      return this["value()B"]()
    });
    Class.prototype["intValue()I"] = (function() {
      return this["value()B"]()
    });
    Class.prototype["longValue()J"] = (function() {
      return this["value()B"]()
    });
    Class.prototype["floatValue()F"] = (function() {
      return this["value()B"]()
    });
    Class.prototype["doubleValue()D"] = (function() {
      return this["value()B"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Byte") && (this["value()B"]() === $.asInstance(arg$that, "java.lang.Byte")["value()B"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return this["value()B"]().toString()
    });
    Class.prototype["<init>(B)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Number"].prototype["<init>()"].call(this);
      this.$jsfield$isInt = true;
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(B)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Byte", Class, JSClass, "java.lang.Number", {
      "java.lang.Byte": true,
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Byte$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$MIN_VALUE = 0;
      this.$jsfield$MAX_VALUE = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["MIN_VALUE()B"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_VALUE()B"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["valueOf(B)Ljava.lang.Byte;"] = (function(arg$byteValue) {
      return new $.c["java.lang.Byte"]()["<init>(B)"](arg$byteValue)
    });
    Class.prototype["parseByte(T)B"] = (function(arg$s) {
      return $.m["java.lang.Integer"]["parseInt(T)I"](arg$s)
    });
    Class.prototype["toString(B)T"] = (function(arg$b) {
      return $.m["java.lang.Integer"]["valueOf(I)Ljava.lang.Integer;"](arg$b)["toString()T"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Byte"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Byte"].cls;
      this.$jsfield$MIN_VALUE = -128;
      this.$jsfield$MAX_VALUE = 127;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()B"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()B"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(B)Ljava.lang.Byte;"](arg$1)
    });
    Class.prototype.parseByte = (function(arg$1) {
      return this["parseByte(T)B"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(B)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Byte$", Class, JSClass, "java.lang.Object", {
      "java.lang.Byte$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Byte", "java.lang.Byte$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.IndexOutOfBoundsException", (function($) {
    function Class() {
      $.c["java.lang.RuntimeException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.RuntimeException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$s) {
      $.c["java.lang.RuntimeException"].prototype["<init>(T)"].call(this, arg$s);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.IndexOutOfBoundsException", Class, JSClass, "java.lang.RuntimeException", {
      "java.lang.IndexOutOfBoundsException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Void", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    var JSClass = undefined;
    $.createClass("java.lang.Void", Class, JSClass, "java.lang.Object", {
      "java.lang.Void": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Void$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Void"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Unit"].cls;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Void$", Class, JSClass, "java.lang.Object", {
      "java.lang.Void$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Void", "java.lang.Void$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.ArrayIndexOutOfBoundsException", (function($) {
    function Class() {
      $.c["java.lang.IndexOutOfBoundsException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.IndexOutOfBoundsException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$s) {
      $.c["java.lang.IndexOutOfBoundsException"].prototype["<init>(T)"].call(this, arg$s);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.ArrayIndexOutOfBoundsException", Class, JSClass, "java.lang.IndexOutOfBoundsException", {
      "java.lang.ArrayIndexOutOfBoundsException": true,
      "java.lang.IndexOutOfBoundsException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.IllegalArgumentException", (function($) {
    function Class() {
      $.c["java.lang.RuntimeException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.RuntimeException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$message) {
      $.c["java.lang.RuntimeException"].prototype["<init>(T)"].call(this, arg$message);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.IllegalArgumentException", Class, JSClass, "java.lang.RuntimeException", {
      "java.lang.IllegalArgumentException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.NumberFormatException", (function($) {
    function Class() {
      $.c["java.lang.IllegalArgumentException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.IllegalArgumentException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$message) {
      $.c["java.lang.IllegalArgumentException"].prototype["<init>(T)"].call(this, arg$message);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.NumberFormatException", Class, JSClass, "java.lang.IllegalArgumentException", {
      "java.lang.NumberFormatException": true,
      "java.lang.IllegalArgumentException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Math$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$JSMath = null;
      this.$jsfield$E = 0.0;
      this.$jsfield$PI = 0.0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["JSMath()Ljava.lang.Math$MathStatic;"] = (function() {
      return this.$jsfield$JSMath
    });
    Class.prototype["E()D"] = (function() {
      return this.$jsfield$E
    });
    Class.prototype["PI()D"] = (function() {
      return this.$jsfield$PI
    });
    Class.prototype["abs(I)I"] = (function(arg$a) {
      return (this["JSMath()Ljava.lang.Math$MathStatic;"]().abs(arg$a) | 0)
    });
    Class.prototype["abs(J)J"] = (function(arg$a) {
      return $.truncateToLong(this["JSMath()Ljava.lang.Math$MathStatic;"]().abs(arg$a))
    });
    Class.prototype["abs(F)F"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().abs(arg$a)
    });
    Class.prototype["abs(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().abs(arg$a)
    });
    Class.prototype["max(II)I"] = (function(arg$a, arg$b) {
      return (this["JSMath()Ljava.lang.Math$MathStatic;"]().max(arg$a, arg$b) | 0)
    });
    Class.prototype["max(JJ)J"] = (function(arg$a, arg$b) {
      return $.truncateToLong(this["JSMath()Ljava.lang.Math$MathStatic;"]().max(arg$a, arg$b))
    });
    Class.prototype["max(FF)F"] = (function(arg$a, arg$b) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().max(arg$a, arg$b)
    });
    Class.prototype["max(DD)D"] = (function(arg$a, arg$b) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().max(arg$a, arg$b)
    });
    Class.prototype["min(II)I"] = (function(arg$a, arg$b) {
      return (this["JSMath()Ljava.lang.Math$MathStatic;"]().min(arg$a, arg$b) | 0)
    });
    Class.prototype["min(JJ)J"] = (function(arg$a, arg$b) {
      return $.truncateToLong(this["JSMath()Ljava.lang.Math$MathStatic;"]().min(arg$a, arg$b))
    });
    Class.prototype["min(FF)F"] = (function(arg$a, arg$b) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().min(arg$a, arg$b)
    });
    Class.prototype["min(DD)D"] = (function(arg$a, arg$b) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().min(arg$a, arg$b)
    });
    Class.prototype["ceil(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().ceil(arg$a)
    });
    Class.prototype["floor(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().floor(arg$a)
    });
    Class.prototype["round(F)I"] = (function(arg$a) {
      return (this["JSMath()Ljava.lang.Math$MathStatic;"]().round(arg$a) | 0)
    });
    Class.prototype["round(D)J"] = (function(arg$a) {
      return $.truncateToLong(this["JSMath()Ljava.lang.Math$MathStatic;"]().round(arg$a))
    });
    Class.prototype["sqrt(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().sqrt(arg$a)
    });
    Class.prototype["pow(DD)D"] = (function(arg$a, arg$b) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().pow(arg$a, arg$b)
    });
    Class.prototype["sin(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().sin(arg$a)
    });
    Class.prototype["cos(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().cos(arg$a)
    });
    Class.prototype["tan(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().tan(arg$a)
    });
    Class.prototype["asin(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().asin(arg$a)
    });
    Class.prototype["acos(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().acos(arg$a)
    });
    Class.prototype["atan(D)D"] = (function(arg$a) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().atan(arg$a)
    });
    Class.prototype["atan2(DD)D"] = (function(arg$y, arg$x) {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().atan2(arg$y, arg$x)
    });
    Class.prototype["random()D"] = (function() {
      return this["JSMath()Ljava.lang.Math$MathStatic;"]().random()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Math"]._instance = this;
      this.$jsfield$JSMath = $.g.Math;
      this.$jsfield$E = this["JSMath()Ljava.lang.Math$MathStatic;"]().E;
      this.$jsfield$PI = this["JSMath()Ljava.lang.Math$MathStatic;"]().PI;
      return this
    });
    Class.prototype.E = (function() {
      return this["E()D"]()
    });
    Class.prototype.PI = (function() {
      return this["PI()D"]()
    });
    Class.prototype.abs = (function(arg$1) {
      return this["abs(D)D"](arg$1);
      return this["abs(F)F"](arg$1);
      return this["abs(J)J"](arg$1);
      return this["abs(I)I"](arg$1)
    });
    Class.prototype.max = (function(arg$1, arg$2) {
      return this["max(DD)D"](arg$1, arg$2);
      return this["max(FF)F"](arg$1, arg$2);
      return this["max(JJ)J"](arg$1, arg$2);
      return this["max(II)I"](arg$1, arg$2)
    });
    Class.prototype.min = (function(arg$1, arg$2) {
      return this["min(DD)D"](arg$1, arg$2);
      return this["min(FF)F"](arg$1, arg$2);
      return this["min(JJ)J"](arg$1, arg$2);
      return this["min(II)I"](arg$1, arg$2)
    });
    Class.prototype.ceil = (function(arg$1) {
      return this["ceil(D)D"](arg$1)
    });
    Class.prototype.floor = (function(arg$1) {
      return this["floor(D)D"](arg$1)
    });
    Class.prototype.round = (function(arg$1) {
      return this["round(D)J"](arg$1);
      return this["round(F)I"](arg$1)
    });
    Class.prototype.sqrt = (function(arg$1) {
      return this["sqrt(D)D"](arg$1)
    });
    Class.prototype.pow = (function(arg$1, arg$2) {
      return this["pow(DD)D"](arg$1, arg$2)
    });
    Class.prototype.sin = (function(arg$1) {
      return this["sin(D)D"](arg$1)
    });
    Class.prototype.cos = (function(arg$1) {
      return this["cos(D)D"](arg$1)
    });
    Class.prototype.tan = (function(arg$1) {
      return this["tan(D)D"](arg$1)
    });
    Class.prototype.asin = (function(arg$1) {
      return this["asin(D)D"](arg$1)
    });
    Class.prototype.acos = (function(arg$1) {
      return this["acos(D)D"](arg$1)
    });
    Class.prototype.atan = (function(arg$1) {
      return this["atan(D)D"](arg$1)
    });
    Class.prototype.atan2 = (function(arg$1, arg$2) {
      return this["atan2(DD)D"](arg$1, arg$2)
    });
    Class.prototype.random = (function() {
      return this["random()D"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Math$", Class, JSClass, "java.lang.Object", {
      "java.lang.Math$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Math", "java.lang.Math$");
  $.createInterface("java.lang.Math$MathStatic", {
    "java.lang.Math$MathStatic": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.ThreadLocal", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$hasValue = false;
      this.$jsfield$i = null;
      this.$jsfield$v = null;
      this.$jsfield$m = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["hasValue()Z"] = (function() {
      return this.$jsfield$hasValue
    });
    Class.prototype["hasValue_=(Z)V"] = (function(arg$x$1) {
      this.$jsfield$hasValue = arg$x$1
    });
    Class.prototype["i()O"] = (function() {
      return this.$jsfield$i
    });
    Class.prototype["i_=(O)V"] = (function(arg$x$1) {
      this.$jsfield$i = arg$x$1
    });
    Class.prototype["v()O"] = (function() {
      return this.$jsfield$v
    });
    Class.prototype["v_=(O)V"] = (function(arg$x$1) {
      this.$jsfield$v = arg$x$1
    });
    Class.prototype["m()Ljava.lang.ThreadLocal$ThreadLocalMap;"] = (function() {
      return this.$jsfield$m
    });
    Class.prototype["m_=(Ljava.lang.ThreadLocal$ThreadLocalMap;)V"] = (function(arg$x$1) {
      this.$jsfield$m = arg$x$1
    });
    Class.prototype["initialValue()O"] = (function() {
      return this["i()O"]()
    });
    Class.prototype["get()O"] = (function() {
      if ((!this["hasValue()Z"]())) {
        this["set(O)V"](this["initialValue()O"]())
      } else {
        /*<skip>*/
      };
      return this["v()O"]()
    });
    Class.prototype["remove()V"] = (function() {
      this["hasValue_=(Z)V"](false)
    });
    Class.prototype["set(O)V"] = (function(arg$o) {
      this["v_=(O)V"](arg$o);
      this["hasValue_=(Z)V"](true)
    });
    Class.prototype["childValue(O)O"] = (function(arg$parentValue) {
      return arg$parentValue
    });
    Class.prototype["createMap(Ljava.lang.Thread;O)V"] = (function(arg$t, arg$firstValue) {
      /*<skip>*/
    });
    Class.prototype["getMap(Ljava.lang.Thread;)Ljava.lang.ThreadLocal$ThreadLocalMap;"] = (function(arg$t) {
      return this["m()Ljava.lang.ThreadLocal$ThreadLocalMap;"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      this.$jsfield$hasValue = false;
      this.$jsfield$m = new $.c["java.lang.ThreadLocal$ThreadLocalMap"]()["<init>()"]();
      return this
    });
    Class.prototype.get = (function() {
      return this["get()O"]()
    });
    Class.prototype.remove = (function() {
      return this["remove()V"]()
    });
    Class.prototype.set = (function(arg$1) {
      return this["set(O)V"](arg$1)
    });
    Class.prototype.childValue = (function(arg$1) {
      return this["childValue(O)O"](arg$1)
    });
    Class.prototype.createMap = (function(arg$1, arg$2) {
      return this["createMap(Ljava.lang.Thread;O)V"](arg$1, arg$2)
    });
    Class.prototype.getMap = (function(arg$1) {
      return this["getMap(Ljava.lang.Thread;)Ljava.lang.ThreadLocal$ThreadLocalMap;"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.ThreadLocal", Class, JSClass, "java.lang.Object", {
      "java.lang.ThreadLocal": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.ThreadLocal$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.ThreadLocal"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.ThreadLocal$", Class, JSClass, "java.lang.Object", {
      "java.lang.ThreadLocal$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.ThreadLocal", "java.lang.ThreadLocal$");
  $.registerClass("java.lang.ThreadLocal$ThreadLocalMap", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.ThreadLocal$ThreadLocalMap", Class, JSClass, "java.lang.Object", {
      "java.lang.ThreadLocal$ThreadLocalMap": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Error", (function($) {
    function Class() {
      $.c["java.lang.Throwable"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Throwable"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.Throwable"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Error", Class, JSClass, "java.lang.Throwable", {
      "java.lang.Error": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.String$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["valueOf(Z)T"] = (function(arg$value) {
      return new $.c["java.lang.Boolean"]()["<init>(Z)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(C)T"] = (function(arg$value) {
      return new $.c["java.lang.Character"]()["<init>(C)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(B)T"] = (function(arg$value) {
      return new $.c["java.lang.Byte"]()["<init>(B)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(S)T"] = (function(arg$value) {
      return new $.c["java.lang.Short"]()["<init>(S)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(I)T"] = (function(arg$value) {
      return new $.c["java.lang.Integer"]()["<init>(I)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(J)T"] = (function(arg$value) {
      return new $.c["java.lang.Long"]()["<init>(J)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(F)T"] = (function(arg$value) {
      return new $.c["java.lang.Float"]()["<init>(F)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(D)T"] = (function(arg$value) {
      return new $.c["java.lang.Double"]()["<init>(D)"](arg$value)["toString()T"]()
    });
    Class.prototype["valueOf(O)T"] = (function(arg$value) {
      return arg$value.toString()
    });
    Class.prototype["readResolve()O"] = (function() {
      return $.m["java.lang.String"]
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.String"]._instance = this;
      return this
    });
    Class.prototype.valueOf = (function(arg$1) {
      if ((typeof(arg$1) === "boolean")) {
        return this["valueOf(Z)T"](arg$1)
      } else {
        if ((typeof(arg$1) === "number")) {
          return this["valueOf(C)T"](arg$1);
          return this["valueOf(B)T"](arg$1);
          return this["valueOf(S)T"](arg$1);
          return this["valueOf(I)T"](arg$1);
          return this["valueOf(J)T"](arg$1);
          return this["valueOf(F)T"](arg$1);
          return this["valueOf(D)T"](arg$1)
        } else {
          if ($.isInstance(arg$1, "java.lang.Object")) {
            return this["valueOf(O)T"](arg$1)
          } else {
            throw "No matching overload"
          }
        }
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.String$", Class, JSClass, "java.lang.Object", {
      "java.lang.String$": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.String", "java.lang.String$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.StringIndexOutOfBoundsException", (function($) {
    function Class() {
      $.c["java.lang.IndexOutOfBoundsException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.IndexOutOfBoundsException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$s) {
      $.c["java.lang.IndexOutOfBoundsException"].prototype["<init>(T)"].call(this, arg$s);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.StringIndexOutOfBoundsException", Class, JSClass, "java.lang.IndexOutOfBoundsException", {
      "java.lang.StringIndexOutOfBoundsException": true,
      "java.lang.IndexOutOfBoundsException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.UnsupportedOperationException", (function($) {
    function Class() {
      $.c["java.lang.RuntimeException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.RuntimeException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.RuntimeException"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.UnsupportedOperationException", Class, JSClass, "java.lang.RuntimeException", {
      "java.lang.UnsupportedOperationException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Boolean", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$value = false
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()Z"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["booleanValue()Z"] = (function() {
      return this["value()Z"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Boolean") && (this["value()Z"]() === $.asInstance(arg$that, "java.lang.Boolean")["value()Z"]()))
    });
    Class.prototype["toString()T"] = (function() {
      if (this["value()Z"]()) {
        return "true"
      } else {
        return "false"
      }
    });
    Class.prototype["hashCode()I"] = (function() {
      if (this["value()Z"]()) {
        return 1231
      } else {
        return 1237
      }
    });
    Class.prototype["<init>(Z)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.booleanValue = (function() {
      return this["booleanValue()Z"]()
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(Z)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Boolean", Class, JSClass, "java.lang.Object", {
      "java.lang.Boolean": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Boolean$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$TRUE = null;
      this.$jsfield$FALSE = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["TRUE()Ljava.lang.Boolean;"] = (function() {
      return this.$jsfield$TRUE
    });
    Class.prototype["FALSE()Ljava.lang.Boolean;"] = (function() {
      return this.$jsfield$FALSE
    });
    Class.prototype["valueOf(Z)Ljava.lang.Boolean;"] = (function(arg$booleanValue) {
      if (arg$booleanValue) {
        return this["TRUE()Ljava.lang.Boolean;"]()
      } else {
        return this["FALSE()Ljava.lang.Boolean;"]()
      }
    });
    Class.prototype["toString(Z)T"] = (function(arg$b) {
      if (arg$b) {
        return "true"
      } else {
        return "false"
      }
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Boolean"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Boolean"].cls;
      this.$jsfield$TRUE = new $.c["java.lang.Boolean"]()["<init>(Z)"](true);
      this.$jsfield$FALSE = new $.c["java.lang.Boolean"]()["<init>(Z)"](false);
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.TRUE = (function() {
      return this["TRUE()Ljava.lang.Boolean;"]()
    });
    Class.prototype.FALSE = (function() {
      return this["FALSE()Ljava.lang.Boolean;"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(Z)Ljava.lang.Boolean;"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(Z)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Boolean$", Class, JSClass, "java.lang.Object", {
      "java.lang.Boolean$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Boolean", "java.lang.Boolean$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Number", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["byteValue()B"] = (function() {
      return this["intValue()I"]()
    });
    Class.prototype["shortValue()S"] = (function() {
      return this["intValue()I"]()
    });
    Class.prototype["scala_==(O)Z"] = (function(arg$other) {
      return $.objectEquals(this, arg$other)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.byteValue = (function() {
      return this["byteValue()B"]()
    });
    Class.prototype.shortValue = (function() {
      return this["shortValue()S"]()
    });
    Class.prototype.intValue = (function() {
      return this["intValue()I"]()
    });
    Class.prototype.longValue = (function() {
      return this["longValue()J"]()
    });
    Class.prototype.floatValue = (function() {
      return this["floatValue()F"]()
    });
    Class.prototype.doubleValue = (function() {
      return this["doubleValue()D"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Number", Class, JSClass, "java.lang.Object", {
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Character", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$value = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["charValue()C"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Character") && (this.$jsfield$value === $.asInstance(arg$that, "java.lang.Character")["charValue()C"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return $.g.String.fromCharCode(this.$jsfield$value)
    });
    Class.prototype["<init>(C)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.charValue = (function() {
      return this["charValue()C"]()
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(C)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Character", Class, JSClass, "java.lang.Object", {
      "java.lang.Character": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Character$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$MIN_VALUE = 0;
      this.$jsfield$MAX_VALUE = 0;
      this.$jsfield$LOWERCASE_LETTER = 0;
      this.$jsfield$UPPERCASE_LETTER = 0;
      this.$jsfield$OTHER_LETTER = 0;
      this.$jsfield$TITLECASE_LETTER = 0;
      this.$jsfield$LETTER_NUMBER = 0;
      this.$jsfield$COMBINING_SPACING_MARK = 0;
      this.$jsfield$ENCLOSING_MARK = 0;
      this.$jsfield$NON_SPACING_MARK = 0;
      this.$jsfield$MODIFIER_LETTER = 0;
      this.$jsfield$DECIMAL_DIGIT_NUMBER = 0;
      this.$jsfield$SURROGATE = 0;
      this.$jsfield$MAX_RADIX = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["MIN_VALUE()C"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_VALUE()C"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["valueOf(C)Ljava.lang.Character;"] = (function(arg$charValue) {
      return new $.c["java.lang.Character"]()["<init>(C)"](arg$charValue)
    });
    Class.prototype["LOWERCASE_LETTER()B"] = (function() {
      return this.$jsfield$LOWERCASE_LETTER
    });
    Class.prototype["UPPERCASE_LETTER()B"] = (function() {
      return this.$jsfield$UPPERCASE_LETTER
    });
    Class.prototype["OTHER_LETTER()B"] = (function() {
      return this.$jsfield$OTHER_LETTER
    });
    Class.prototype["TITLECASE_LETTER()B"] = (function() {
      return this.$jsfield$TITLECASE_LETTER
    });
    Class.prototype["LETTER_NUMBER()B"] = (function() {
      return this.$jsfield$LETTER_NUMBER
    });
    Class.prototype["COMBINING_SPACING_MARK()B"] = (function() {
      return this.$jsfield$COMBINING_SPACING_MARK
    });
    Class.prototype["ENCLOSING_MARK()B"] = (function() {
      return this.$jsfield$ENCLOSING_MARK
    });
    Class.prototype["NON_SPACING_MARK()B"] = (function() {
      return this.$jsfield$NON_SPACING_MARK
    });
    Class.prototype["MODIFIER_LETTER()B"] = (function() {
      return this.$jsfield$MODIFIER_LETTER
    });
    Class.prototype["DECIMAL_DIGIT_NUMBER()B"] = (function() {
      return this.$jsfield$DECIMAL_DIGIT_NUMBER
    });
    Class.prototype["SURROGATE()B"] = (function() {
      return this.$jsfield$SURROGATE
    });
    Class.prototype["MAX_RADIX()I"] = (function() {
      return this.$jsfield$MAX_RADIX
    });
    Class.prototype["getType(C)I"] = (function(arg$ch) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["getType(I)I"] = (function(arg$codePoint) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["digit(CI)I"] = (function(arg$c, arg$radix) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isISOControl(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isDigit(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isLetter(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isLetterOrDigit(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isWhitespace(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isSpaceChar(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isHighSurrogate(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isLowSurrogate(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isUnicodeIdentifierStart(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isUnicodeIdentifierPart(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isIdentifierIgnorable(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isMirrored(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isLowerCase(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isUpperCase(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isTitleCase(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isJavaIdentifierPart(C)Z"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["getDirectionality(C)B"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toUpperCase(C)C"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toLowerCase(C)C"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toTitleCase(C)C"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["getNumericValue(C)I"] = (function(arg$c) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["reverseBytes(C)C"] = (function(arg$ch) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toString(C)T"] = (function(arg$c) {
      return this["valueOf(C)Ljava.lang.Character;"](arg$c)["toString()T"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Character"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Char"].cls;
      this.$jsfield$MIN_VALUE = 0;
      this.$jsfield$MAX_VALUE = 255;
      this.$jsfield$LOWERCASE_LETTER = 0;
      this.$jsfield$UPPERCASE_LETTER = 0;
      this.$jsfield$OTHER_LETTER = 0;
      this.$jsfield$TITLECASE_LETTER = 0;
      this.$jsfield$LETTER_NUMBER = 0;
      this.$jsfield$COMBINING_SPACING_MARK = 0;
      this.$jsfield$ENCLOSING_MARK = 0;
      this.$jsfield$NON_SPACING_MARK = 0;
      this.$jsfield$MODIFIER_LETTER = 0;
      this.$jsfield$DECIMAL_DIGIT_NUMBER = 0;
      this.$jsfield$SURROGATE = 0;
      this.$jsfield$MAX_RADIX = 0;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()C"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()C"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(C)Ljava.lang.Character;"](arg$1)
    });
    Class.prototype.LOWERCASE_LETTER = (function() {
      return this["LOWERCASE_LETTER()B"]()
    });
    Class.prototype.UPPERCASE_LETTER = (function() {
      return this["UPPERCASE_LETTER()B"]()
    });
    Class.prototype.OTHER_LETTER = (function() {
      return this["OTHER_LETTER()B"]()
    });
    Class.prototype.TITLECASE_LETTER = (function() {
      return this["TITLECASE_LETTER()B"]()
    });
    Class.prototype.LETTER_NUMBER = (function() {
      return this["LETTER_NUMBER()B"]()
    });
    Class.prototype.COMBINING_SPACING_MARK = (function() {
      return this["COMBINING_SPACING_MARK()B"]()
    });
    Class.prototype.ENCLOSING_MARK = (function() {
      return this["ENCLOSING_MARK()B"]()
    });
    Class.prototype.NON_SPACING_MARK = (function() {
      return this["NON_SPACING_MARK()B"]()
    });
    Class.prototype.MODIFIER_LETTER = (function() {
      return this["MODIFIER_LETTER()B"]()
    });
    Class.prototype.DECIMAL_DIGIT_NUMBER = (function() {
      return this["DECIMAL_DIGIT_NUMBER()B"]()
    });
    Class.prototype.SURROGATE = (function() {
      return this["SURROGATE()B"]()
    });
    Class.prototype.MAX_RADIX = (function() {
      return this["MAX_RADIX()I"]()
    });
    Class.prototype.getType = (function(arg$1) {
      return this["getType(I)I"](arg$1);
      return this["getType(C)I"](arg$1)
    });
    Class.prototype.digit = (function(arg$1, arg$2) {
      return this["digit(CI)I"](arg$1, arg$2)
    });
    Class.prototype.isISOControl = (function(arg$1) {
      return this["isISOControl(C)Z"](arg$1)
    });
    Class.prototype.isDigit = (function(arg$1) {
      return this["isDigit(C)Z"](arg$1)
    });
    Class.prototype.isLetter = (function(arg$1) {
      return this["isLetter(C)Z"](arg$1)
    });
    Class.prototype.isLetterOrDigit = (function(arg$1) {
      return this["isLetterOrDigit(C)Z"](arg$1)
    });
    Class.prototype.isWhitespace = (function(arg$1) {
      return this["isWhitespace(C)Z"](arg$1)
    });
    Class.prototype.isSpaceChar = (function(arg$1) {
      return this["isSpaceChar(C)Z"](arg$1)
    });
    Class.prototype.isHighSurrogate = (function(arg$1) {
      return this["isHighSurrogate(C)Z"](arg$1)
    });
    Class.prototype.isLowSurrogate = (function(arg$1) {
      return this["isLowSurrogate(C)Z"](arg$1)
    });
    Class.prototype.isUnicodeIdentifierStart = (function(arg$1) {
      return this["isUnicodeIdentifierStart(C)Z"](arg$1)
    });
    Class.prototype.isUnicodeIdentifierPart = (function(arg$1) {
      return this["isUnicodeIdentifierPart(C)Z"](arg$1)
    });
    Class.prototype.isIdentifierIgnorable = (function(arg$1) {
      return this["isIdentifierIgnorable(C)Z"](arg$1)
    });
    Class.prototype.isMirrored = (function(arg$1) {
      return this["isMirrored(C)Z"](arg$1)
    });
    Class.prototype.isLowerCase = (function(arg$1) {
      return this["isLowerCase(C)Z"](arg$1)
    });
    Class.prototype.isUpperCase = (function(arg$1) {
      return this["isUpperCase(C)Z"](arg$1)
    });
    Class.prototype.isTitleCase = (function(arg$1) {
      return this["isTitleCase(C)Z"](arg$1)
    });
    Class.prototype.isJavaIdentifierPart = (function(arg$1) {
      return this["isJavaIdentifierPart(C)Z"](arg$1)
    });
    Class.prototype.getDirectionality = (function(arg$1) {
      return this["getDirectionality(C)B"](arg$1)
    });
    Class.prototype.toUpperCase = (function(arg$1) {
      return this["toUpperCase(C)C"](arg$1)
    });
    Class.prototype.toLowerCase = (function(arg$1) {
      return this["toLowerCase(C)C"](arg$1)
    });
    Class.prototype.toTitleCase = (function(arg$1) {
      return this["toTitleCase(C)C"](arg$1)
    });
    Class.prototype.getNumericValue = (function(arg$1) {
      return this["getNumericValue(C)I"](arg$1)
    });
    Class.prototype.reverseBytes = (function(arg$1) {
      return this["reverseBytes(C)C"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(C)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Character$", Class, JSClass, "java.lang.Object", {
      "java.lang.Character$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Character", "java.lang.Character$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Class", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$env = null;
      this.$jsfield$data = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["env()Lscala.js.Dynamic;"] = (function() {
      return this.$jsfield$env
    });
    Class.prototype["data()Lscala.js.Dynamic;"] = (function() {
      return this.$jsfield$data
    });
    Class.prototype["toString()T"] = (function() {
      if (this["isInterface()Z"]()) {
        var jsx$1 = "interface "
      } else {
        if (this["isPrimitive()Z"]()) {
          var jsx$1 = ""
        } else {
          var jsx$1 = "class "
        }
      };
      var jsx$2 = this["getName()T"]();
      return (jsx$1 + jsx$2)
    });
    Class.prototype["isInstance(O)Z"] = (function(arg$obj) {
      return this["env()Lscala.js.Dynamic;"]().isInstance(arg$obj, this["data()Lscala.js.Dynamic;"]().name)
    });
    Class.prototype["isAssignableFrom(Ljava.lang.Class;)Z"] = (function(arg$that) {
      return (!(!arg$that["data()Lscala.js.Dynamic;"]().ancestors[this["data()Lscala.js.Dynamic;"]().name]))
    });
    Class.prototype["isInterface()Z"] = (function() {
      return this["data()Lscala.js.Dynamic;"]().isInterface
    });
    Class.prototype["isArray()Z"] = (function() {
      return this["data()Lscala.js.Dynamic;"]().isArray
    });
    Class.prototype["isPrimitive()Z"] = (function() {
      return this["data()Lscala.js.Dynamic;"]().isPrimitive
    });
    Class.prototype["getName()T"] = (function() {
      return this["data()Lscala.js.Dynamic;"]().displayName
    });
    Class.prototype["getSuperClass()Ljava.lang.Class;"] = (function() {
      if ((!this["data()Lscala.js.Dynamic;"]().parentData)) {
        return null
      } else {
        return $.asInstance(this["data()Lscala.js.Dynamic;"]().parentData.cls, "java.lang.Class")
      }
    });
    Class.prototype["getComponentType()Ljava.lang.Class;"] = (function() {
      if (this["isArray()Z"]()) {
        return $.asInstance(this["data()Lscala.js.Dynamic;"]().componentData.cls, "java.lang.Class")
      } else {
        return null
      }
    });
    Class.prototype["<init>(Lscala.js.Dynamic;Lscala.js.Dynamic;)"] = (function(arg$env, arg$data) {
      this.$jsfield$env = arg$env;
      this.$jsfield$data = arg$data;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.isInstance = (function(arg$1) {
      return this["isInstance(O)Z"](arg$1)
    });
    Class.prototype.isAssignableFrom = (function(arg$1) {
      return this["isAssignableFrom(Ljava.lang.Class;)Z"](arg$1)
    });
    Class.prototype.isInterface = (function() {
      return this["isInterface()Z"]()
    });
    Class.prototype.isArray = (function() {
      return this["isArray()Z"]()
    });
    Class.prototype.isPrimitive = (function() {
      return this["isPrimitive()Z"]()
    });
    Class.prototype.getName = (function() {
      return this["getName()T"]()
    });
    Class.prototype.getSuperClass = (function() {
      return this["getSuperClass()Ljava.lang.Class;"]()
    });
    Class.prototype.getComponentType = (function() {
      return this["getComponentType()Ljava.lang.Class;"]()
    });
    var JSClass = undefined;
    $.createClass("java.lang.Class", Class, JSClass, "java.lang.Object", {
      "java.lang.Class": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.System$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$out = null;
      this.$jsfield$err = null;
      this.$jsfield$in = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["out()Ljava.io.PrintStream;"] = (function() {
      return this.$jsfield$out
    });
    Class.prototype["out_=(Ljava.io.PrintStream;)V"] = (function(arg$x$1) {
      this.$jsfield$out = arg$x$1
    });
    Class.prototype["err()Ljava.io.PrintStream;"] = (function() {
      return this.$jsfield$err
    });
    Class.prototype["err_=(Ljava.io.PrintStream;)V"] = (function(arg$x$1) {
      this.$jsfield$err = arg$x$1
    });
    Class.prototype["in()Ljava.io.InputStream;"] = (function() {
      return this.$jsfield$in
    });
    Class.prototype["in_=(Ljava.io.InputStream;)V"] = (function(arg$x$1) {
      this.$jsfield$in = arg$x$1
    });
    Class.prototype["currentTimeMillis()J"] = (function() {
      return $.truncateToLong(new $.g.Date().getTime())
    });
    Class.prototype["arraycopy(OIOII)V"] = (function(arg$src, arg$srcPos, arg$dest, arg$destPos, arg$length) {
      var jsSrc$jsid$22783 = $.m["java.lang.reflect.Array"]["getUnderlying(O)Lscala.js.Array;"](arg$src);
      var jsDest$jsid$22784 = $.m["java.lang.reflect.Array"]["getUnderlying(O)Lscala.js.Array;"](arg$dest);
      var i$jsid$22785 = 0;
      while ((i$jsid$22785 < arg$length)) {
        jsDest$jsid$22784[(arg$destPos + i$jsid$22785)] = jsSrc$jsid$22783[(arg$srcPos + i$jsid$22785)];
        i$jsid$22785 = (i$jsid$22785 + 1)
      }
    });
    Class.prototype["identityHashCode(O)I"] = (function(arg$x) {
      return 42
    });
    Class.prototype["getProperties()Ljava.util.Properties;"] = (function() {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.getProperties() not implemented")
    });
    Class.prototype["getProperty(T)T"] = (function(arg$key) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.getProperty() not implemented")
    });
    Class.prototype["getProperty(TT)T"] = (function(arg$key, arg$default) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.getProperty() not implemented")
    });
    Class.prototype["clearProperty(T)T"] = (function(arg$key) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.clearProperty() not implemented")
    });
    Class.prototype["setProperty(TT)T"] = (function(arg$key, arg$value) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.setProperty() not implemented")
    });
    Class.prototype["getenv()Ljava.util.Map;"] = (function() {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.getenv() not implemented")
    });
    Class.prototype["getenv(T)T"] = (function(arg$name) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("System.getenv() not implemented")
    });
    Class.prototype["exit(I)V"] = (function(arg$status) {
      $.m["java.lang.Runtime"]["getRuntime()Ljava.lang.Runtime;"]()["exit(I)V"](arg$status)
    });
    Class.prototype["gc()V"] = (function() {
      $.m["java.lang.Runtime"]["getRuntime()Ljava.lang.Runtime;"]()["gc()V"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.System"]._instance = this;
      this.$jsfield$out = $.m["java.lang.StandardOutPrintStream"];
      this.$jsfield$err = $.m["java.lang.StandardErrPrintStream"];
      this.$jsfield$in = null;
      return this
    });
    Class.prototype.out = (function() {
      return this["out()Ljava.io.PrintStream;"]()
    });
    Class.prototype["out_="] = (function(arg$1) {
      return this["out_=(Ljava.io.PrintStream;)V"](arg$1)
    });
    Class.prototype.err = (function() {
      return this["err()Ljava.io.PrintStream;"]()
    });
    Class.prototype["err_="] = (function(arg$1) {
      return this["err_=(Ljava.io.PrintStream;)V"](arg$1)
    });
    Class.prototype["in"] = (function() {
      return this["in()Ljava.io.InputStream;"]()
    });
    Class.prototype["in_="] = (function(arg$1) {
      return this["in_=(Ljava.io.InputStream;)V"](arg$1)
    });
    Class.prototype.currentTimeMillis = (function() {
      return this["currentTimeMillis()J"]()
    });
    Class.prototype.arraycopy = (function(arg$1, arg$2, arg$3, arg$4, arg$5) {
      return this["arraycopy(OIOII)V"](arg$1, arg$2, arg$3, arg$4, arg$5)
    });
    Class.prototype.identityHashCode = (function(arg$1) {
      return this["identityHashCode(O)I"](arg$1)
    });
    Class.prototype.getProperties = (function() {
      return this["getProperties()Ljava.util.Properties;"]()
    });
    Class.prototype.getProperty = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          return this["getProperty(T)T"](arg$1);
        case 2:
          return this["getProperty(TT)T"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.clearProperty = (function(arg$1) {
      return this["clearProperty(T)T"](arg$1)
    });
    Class.prototype.setProperty = (function(arg$1, arg$2) {
      return this["setProperty(TT)T"](arg$1, arg$2)
    });
    Class.prototype.getenv = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["getenv()Ljava.util.Map;"]();
        case 1:
          return this["getenv(T)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.exit = (function(arg$1) {
      return this["exit(I)V"](arg$1)
    });
    Class.prototype.gc = (function() {
      return this["gc()V"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.System$", Class, JSClass, "java.lang.Object", {
      "java.lang.System$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.System", "java.lang.System$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.StandardOut$", (function($) {
    function Class() {
      $.c["java.io.OutputStream"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.io.OutputStream"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["write(I)V"] = (function(arg$b) {
      $.m["java.lang.StandardOutPrintStream"]["writeString(T)V"]($.bC(arg$b).toString())
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.io.OutputStream"].prototype["<init>()"].call(this);
      $.modules["java.lang.StandardOut"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.StandardOut$", Class, JSClass, "java.io.OutputStream", {
      "java.lang.StandardOut$": true,
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.StandardOut", "java.lang.StandardOut$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Throwable", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$message = null;
      this.$jsfield$cause = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["getStackTrace()[Ljava.lang.StackTraceElement;"] = (function() {
      return null
    });
    Class.prototype["getMessage()T"] = (function() {
      return this.$jsfield$message
    });
    Class.prototype["printStackTrace()V"] = (function() {
      /*<skip>*/
    });
    Class.prototype["getCause()Ljava.lang.Throwable;"] = (function() {
      return this.$jsfield$cause
    });
    Class.prototype["fillInStackTrace()Ljava.lang.Throwable;"] = (function() {
      return this
    });
    Class.prototype["toString()T"] = (function() {
      if ((this.$jsfield$message === null)) {
        return $.objectGetClass(this)["getName()T"]()
      } else {
        return (($.objectGetClass(this)["getName()T"]() + ": ") + this.$jsfield$message)
      }
    });
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      this.$jsfield$message = arg$message;
      this.$jsfield$cause = arg$cause;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    Class.prototype.getStackTrace = (function() {
      return this["getStackTrace()[Ljava.lang.StackTraceElement;"]()
    });
    Class.prototype.getMessage = (function() {
      return this["getMessage()T"]()
    });
    Class.prototype.printStackTrace = (function() {
      return this["printStackTrace()V"]()
    });
    Class.prototype.getCause = (function() {
      return this["getCause()Ljava.lang.Throwable;"]()
    });
    Class.prototype.fillInStackTrace = (function() {
      return this["fillInStackTrace()Ljava.lang.Throwable;"]()
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Throwable", Class, JSClass, "java.lang.Object", {
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Short", (function($) {
    function Class() {
      $.c["java.lang.Number"].prototype.constructor.call(this);
      this.$jsfield$value = 0;
      this.$jsfield$isInt = false
    };
    Class.prototype = Object.create($.c["java.lang.Number"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()S"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["isInt()Z"] = (function() {
      return this.$jsfield$isInt
    });
    Class.prototype["byteValue()B"] = (function() {
      return this["value()S"]()
    });
    Class.prototype["shortValue()S"] = (function() {
      return this["value()S"]()
    });
    Class.prototype["intValue()I"] = (function() {
      return this["value()S"]()
    });
    Class.prototype["longValue()J"] = (function() {
      return this["value()S"]()
    });
    Class.prototype["floatValue()F"] = (function() {
      return this["value()S"]()
    });
    Class.prototype["doubleValue()D"] = (function() {
      return this["value()S"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Short") && (this["value()S"]() === $.asInstance(arg$that, "java.lang.Short")["value()S"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return this["value()S"]().toString()
    });
    Class.prototype["<init>(S)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Number"].prototype["<init>()"].call(this);
      this.$jsfield$isInt = true;
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(S)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Short", Class, JSClass, "java.lang.Number", {
      "java.lang.Short": true,
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Short$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$MIN_VALUE = 0;
      this.$jsfield$MAX_VALUE = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["MIN_VALUE()S"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_VALUE()S"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["valueOf(S)Ljava.lang.Short;"] = (function(arg$shortValue) {
      return new $.c["java.lang.Short"]()["<init>(S)"](arg$shortValue)
    });
    Class.prototype["parseShort(T)S"] = (function(arg$s) {
      return $.m["java.lang.Integer"]["parseInt(T)I"](arg$s)
    });
    Class.prototype["toString(S)T"] = (function(arg$s) {
      return $.m["java.lang.Integer"]["valueOf(I)Ljava.lang.Integer;"](arg$s)["toString()T"]()
    });
    Class.prototype["reverseBytes(S)S"] = (function(arg$i) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Short"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Short"].cls;
      this.$jsfield$MIN_VALUE = -32768;
      this.$jsfield$MAX_VALUE = 32767;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()S"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()S"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(S)Ljava.lang.Short;"](arg$1)
    });
    Class.prototype.parseShort = (function(arg$1) {
      return this["parseShort(T)S"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(S)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.reverseBytes = (function(arg$1) {
      return this["reverseBytes(S)S"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Short$", Class, JSClass, "java.lang.Object", {
      "java.lang.Short$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Short", "java.lang.Short$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.CloneNotSupportedException", (function($) {
    function Class() {
      $.c["java.lang.Exception"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Exception"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$s) {
      $.c["java.lang.Exception"].prototype["<init>(T)"].call(this, arg$s);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.CloneNotSupportedException", Class, JSClass, "java.lang.Exception", {
      "java.lang.CloneNotSupportedException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.StandardErr$", (function($) {
    function Class() {
      $.c["java.io.OutputStream"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.io.OutputStream"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["write(I)V"] = (function(arg$b) {
      $.m["java.lang.StandardErrPrintStream"]["writeString(T)V"]($.bC(arg$b).toString())
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.io.OutputStream"].prototype["<init>()"].call(this);
      $.modules["java.lang.StandardErr"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.StandardErr$", Class, JSClass, "java.io.OutputStream", {
      "java.lang.StandardErr$": true,
      "java.io.OutputStream": true,
      "java.io.Flushable": true,
      "java.io.Closeable": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.StandardErr", "java.lang.StandardErr$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Integer", (function($) {
    function Class() {
      $.c["java.lang.Number"].prototype.constructor.call(this);
      this.$jsfield$value = 0;
      this.$jsfield$isInt = false
    };
    Class.prototype = Object.create($.c["java.lang.Number"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()I"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["isInt()Z"] = (function() {
      return this.$jsfield$isInt
    });
    Class.prototype["intValue()I"] = (function() {
      return this["value()I"]()
    });
    Class.prototype["longValue()J"] = (function() {
      return this["value()I"]()
    });
    Class.prototype["floatValue()F"] = (function() {
      return this["value()I"]()
    });
    Class.prototype["doubleValue()D"] = (function() {
      return this["value()I"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Integer") && (this["value()I"]() === $.asInstance(arg$that, "java.lang.Integer")["value()I"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return this["value()I"]().toString()
    });
    Class.prototype["<init>(I)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Number"].prototype["<init>()"].call(this);
      this.$jsfield$isInt = true;
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(I)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Integer", Class, JSClass, "java.lang.Number", {
      "java.lang.Integer": true,
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Integer$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$MIN_VALUE = 0;
      this.$jsfield$MAX_VALUE = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["MIN_VALUE()I"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_VALUE()I"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["valueOf(I)Ljava.lang.Integer;"] = (function(arg$intValue) {
      return new $.c["java.lang.Integer"]()["<init>(I)"](arg$intValue)
    });
    Class.prototype["parseInt(T)I"] = (function(arg$s) {
      return ($.g.parseInt(arg$s) | 0)
    });
    Class.prototype["parseInt(TI)I"] = (function(arg$s, arg$radix) {
      return ($.g.parseInt(arg$s, arg$radix) | 0)
    });
    Class.prototype["toString(I)T"] = (function(arg$i) {
      return this["valueOf(I)Ljava.lang.Integer;"](arg$i)["toString()T"]()
    });
    Class.prototype["bitCount(I)I"] = (function(arg$i) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["reverseBytes(I)I"] = (function(arg$i) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["rotateLeft(II)I"] = (function(arg$i, arg$distance) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["rotateRight(II)I"] = (function(arg$i, arg$distance) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["toBinaryString(I)T"] = (function(arg$i) {
      return arg$i.toString(2)
    });
    Class.prototype["toHexString(I)T"] = (function(arg$i) {
      return arg$i.toString(16)
    });
    Class.prototype["toOctalString(I)T"] = (function(arg$i) {
      return arg$i.toString(8)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Integer"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Int"].cls;
      this.$jsfield$MIN_VALUE = -2147483648;
      this.$jsfield$MAX_VALUE = 2147483647;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()I"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()I"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(I)Ljava.lang.Integer;"](arg$1)
    });
    Class.prototype.parseInt = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          return this["parseInt(T)I"](arg$1);
        case 2:
          return this["parseInt(TI)I"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(I)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.bitCount = (function(arg$1) {
      return this["bitCount(I)I"](arg$1)
    });
    Class.prototype.reverseBytes = (function(arg$1) {
      return this["reverseBytes(I)I"](arg$1)
    });
    Class.prototype.rotateLeft = (function(arg$1, arg$2) {
      return this["rotateLeft(II)I"](arg$1, arg$2)
    });
    Class.prototype.rotateRight = (function(arg$1, arg$2) {
      return this["rotateRight(II)I"](arg$1, arg$2)
    });
    Class.prototype.toBinaryString = (function(arg$1) {
      return this["toBinaryString(I)T"](arg$1)
    });
    Class.prototype.toHexString = (function(arg$1) {
      return this["toHexString(I)T"](arg$1)
    });
    Class.prototype.toOctalString = (function(arg$1) {
      return this["toOctalString(I)T"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Integer$", Class, JSClass, "java.lang.Object", {
      "java.lang.Integer$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Integer", "java.lang.Integer$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.Float", (function($) {
    function Class() {
      $.c["java.lang.Number"].prototype.constructor.call(this);
      this.$jsfield$value = 0.0;
      this.$jsfield$isInt = false
    };
    Class.prototype = Object.create($.c["java.lang.Number"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["value()F"] = (function() {
      return this.$jsfield$value
    });
    Class.prototype["isInt()Z"] = (function() {
      return this.$jsfield$isInt
    });
    Class.prototype["byteValue()B"] = (function() {
      return (this["value()F"]() | 0)
    });
    Class.prototype["shortValue()S"] = (function() {
      return (this["value()F"]() | 0)
    });
    Class.prototype["intValue()I"] = (function() {
      return (this["value()F"]() | 0)
    });
    Class.prototype["longValue()J"] = (function() {
      return $.truncateToLong(this["value()F"]())
    });
    Class.prototype["floatValue()F"] = (function() {
      return this["value()F"]()
    });
    Class.prototype["doubleValue()D"] = (function() {
      return this["value()F"]()
    });
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return ($.isInstance(arg$that, "java.lang.Float") && (this["value()F"]() === $.asInstance(arg$that, "java.lang.Float")["value()F"]()))
    });
    Class.prototype["toString()T"] = (function() {
      return this["value()F"]().toString()
    });
    Class.prototype["isNaN()Z"] = (function() {
      return $.m["java.lang.Float"]["isNaN(F)Z"](this["value()F"]())
    });
    Class.prototype["<init>(F)"] = (function(arg$value) {
      this.$jsfield$value = arg$value;
      $.c["java.lang.Number"].prototype["<init>()"].call(this);
      this.$jsfield$isInt = false;
      return this
    });
    Class.prototype.isNaN = (function() {
      return this["isNaN()Z"]()
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(F)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Float", Class, JSClass, "java.lang.Number", {
      "java.lang.Float": true,
      "java.lang.Number": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("java.lang.Float$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$TYPE = null;
      this.$jsfield$POSITIVE_INFINITY = 0.0;
      this.$jsfield$NEGATIVE_INFINITY = 0.0;
      this.$jsfield$NaN = 0.0;
      this.$jsfield$MAX_VALUE = 0.0;
      this.$jsfield$MIN_NORMAL = 0.0;
      this.$jsfield$MIN_VALUE = 0.0;
      this.$jsfield$MAX_EXPONENT = 0;
      this.$jsfield$MIN_EXPONENT = 0;
      this.$jsfield$SIZE = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["POSITIVE_INFINITY()F"] = (function() {
      return this.$jsfield$POSITIVE_INFINITY
    });
    Class.prototype["NEGATIVE_INFINITY()F"] = (function() {
      return this.$jsfield$NEGATIVE_INFINITY
    });
    Class.prototype["NaN()F"] = (function() {
      return this.$jsfield$NaN
    });
    Class.prototype["MAX_VALUE()F"] = (function() {
      return this.$jsfield$MAX_VALUE
    });
    Class.prototype["MIN_NORMAL()F"] = (function() {
      return this.$jsfield$MIN_NORMAL
    });
    Class.prototype["MIN_VALUE()F"] = (function() {
      return this.$jsfield$MIN_VALUE
    });
    Class.prototype["MAX_EXPONENT()I"] = (function() {
      return this.$jsfield$MAX_EXPONENT
    });
    Class.prototype["MIN_EXPONENT()I"] = (function() {
      return this.$jsfield$MIN_EXPONENT
    });
    Class.prototype["SIZE()I"] = (function() {
      return this.$jsfield$SIZE
    });
    Class.prototype["valueOf(F)Ljava.lang.Float;"] = (function(arg$floatValue) {
      return new $.c["java.lang.Float"]()["<init>(F)"](arg$floatValue)
    });
    Class.prototype["parseFloat(T)F"] = (function(arg$s) {
      return $.g.parseFloat(arg$s)
    });
    Class.prototype["toString(F)T"] = (function(arg$f) {
      return this["valueOf(F)Ljava.lang.Float;"](arg$f)["toString()T"]()
    });
    Class.prototype["compare(FF)I"] = (function(arg$a, arg$b) {
      if ((arg$a === arg$b)) {
        return 0
      } else {
        if ((arg$a < arg$b)) {
          return -1
        } else {
          return 1
        }
      }
    });
    Class.prototype["isNaN(F)Z"] = (function(arg$v) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["isInfinite(F)Z"] = (function(arg$v) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["intBitsToFloat(I)F"] = (function(arg$bits) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["floatToIntBits(F)I"] = (function(arg$value) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"]("unimplemented")
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.Float"]._instance = this;
      this.$jsfield$TYPE = $.primitives["scala.Float"].cls;
      this.$jsfield$POSITIVE_INFINITY = 0.0;
      this.$jsfield$NEGATIVE_INFINITY = 0.0;
      this.$jsfield$NaN = 0.0;
      this.$jsfield$MAX_VALUE = 0.0;
      this.$jsfield$MIN_NORMAL = 0.0;
      this.$jsfield$MIN_VALUE = 0.0;
      this.$jsfield$MAX_EXPONENT = 127;
      this.$jsfield$MIN_EXPONENT = -126;
      this.$jsfield$SIZE = 32;
      return this
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    Class.prototype.POSITIVE_INFINITY = (function() {
      return this["POSITIVE_INFINITY()F"]()
    });
    Class.prototype.NEGATIVE_INFINITY = (function() {
      return this["NEGATIVE_INFINITY()F"]()
    });
    Class.prototype.NaN = (function() {
      return this["NaN()F"]()
    });
    Class.prototype.MAX_VALUE = (function() {
      return this["MAX_VALUE()F"]()
    });
    Class.prototype.MIN_NORMAL = (function() {
      return this["MIN_NORMAL()F"]()
    });
    Class.prototype.MIN_VALUE = (function() {
      return this["MIN_VALUE()F"]()
    });
    Class.prototype.MAX_EXPONENT = (function() {
      return this["MAX_EXPONENT()I"]()
    });
    Class.prototype.MIN_EXPONENT = (function() {
      return this["MIN_EXPONENT()I"]()
    });
    Class.prototype.SIZE = (function() {
      return this["SIZE()I"]()
    });
    Class.prototype.valueOf = (function(arg$1) {
      return this["valueOf(F)Ljava.lang.Float;"](arg$1)
    });
    Class.prototype.parseFloat = (function(arg$1) {
      return this["parseFloat(T)F"](arg$1)
    });
    Class.prototype.toString = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["toString()T"]();
        case 1:
          return this["toString(F)T"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.compare = (function(arg$1, arg$2) {
      return this["compare(FF)I"](arg$1, arg$2)
    });
    Class.prototype.isNaN = (function(arg$1) {
      return this["isNaN(F)Z"](arg$1)
    });
    Class.prototype.isInfinite = (function(arg$1) {
      return this["isInfinite(F)Z"](arg$1)
    });
    Class.prototype.intBitsToFloat = (function(arg$1) {
      return this["intBitsToFloat(I)F"](arg$1)
    });
    Class.prototype.floatToIntBits = (function(arg$1) {
      return this["floatToIntBits(F)I"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.Float$", Class, JSClass, "java.lang.Object", {
      "java.lang.Float$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.Float", "java.lang.Float$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.ClassCastException", (function($) {
    function Class() {
      $.c["java.lang.RuntimeException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.RuntimeException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.RuntimeException"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.ClassCastException", Class, JSClass, "java.lang.RuntimeException", {
      "java.lang.ClassCastException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.AssertionError", (function($) {
    function Class() {
      $.c["java.lang.Throwable"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Throwable"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$message) {
      $.c["java.lang.Throwable"].prototype["<init>(T)"].call(this, arg$message);
      return this
    });
    Class.prototype["<init>(O)"] = (function(arg$o) {
      if ((arg$o === null)) {
        var jsx$1 = null
      } else {
        var jsx$1 = arg$o.toString()
      };
      this["<init>(T)"](jsx$1);
      return this
    });
    Class.prototype["<init>(Z)"] = (function(arg$b) {
      this["<init>(T)"]($.bZ(arg$b).toString());
      return this
    });
    Class.prototype["<init>(C)"] = (function(arg$c) {
      this["<init>(T)"]($.bC(arg$c).toString());
      return this
    });
    Class.prototype["<init>(D)"] = (function(arg$d) {
      this["<init>(T)"]($.bD(arg$d).toString());
      return this
    });
    Class.prototype["<init>(F)"] = (function(arg$f) {
      this["<init>(T)"]($.bF(arg$f).toString());
      return this
    });
    Class.prototype["<init>(I)"] = (function(arg$i) {
      this["<init>(T)"]($.bI(arg$i).toString());
      return this
    });
    Class.prototype["<init>(J)"] = (function(arg$l) {
      this["<init>(T)"]($.bJ(arg$l).toString());
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      if ((typeof(arg$1) === "boolean")) {
        return this["<init>(Z)"](arg$1)
      } else {
        if ((typeof(arg$1) === "number")) {
          return this["<init>(C)"](arg$1);
          return this["<init>(D)"](arg$1);
          return this["<init>(F)"](arg$1);
          return this["<init>(I)"](arg$1);
          return this["<init>(J)"](arg$1)
        } else {
          if ($.isInstance(arg$1, "java.lang.Object")) {
            return this["<init>(O)"](arg$1)
          } else {
            throw "No matching overload"
          }
        }
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.AssertionError", Class, JSClass, "java.lang.Throwable", {
      "java.lang.AssertionError": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.NullPointerException", (function($) {
    function Class() {
      $.c["java.lang.Exception"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Exception"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(T)"] = (function(arg$message) {
      $.c["java.lang.Exception"].prototype["<init>(T)"].call(this, arg$message);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(T)"](null);
      return this
    });
    function JSClass(arg$1) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          return this["<init>(T)"](arg$1);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.NullPointerException", Class, JSClass, "java.lang.Exception", {
      "java.lang.NullPointerException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.lang.reflect.Array$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["getUnderlying(O)Lscala.js.Array;"] = (function(arg$array) {
      return arg$array.underlying
    });
    Class.prototype["newInstance(Ljava.lang.Class;I)O"] = (function(arg$componentType, arg$length) {
      return this["newArray(Ljava.lang.Class;I)O"](arg$componentType, arg$length)
    });
    Class.prototype["newInstance(Ljava.lang.Class;[I)O"] = (function(arg$componentType, arg$dimensions) {
      return this["multiNewArray(Ljava.lang.Class;[I)O"](arg$componentType, arg$dimensions)
    });
    Class.prototype["getLength(O)I"] = (function(arg$array) {
      return (this["getUnderlying(O)Lscala.js.Array;"](arg$array).length | 0)
    });
    Class.prototype["get(OI)O"] = (function(arg$array, arg$index) {
      return this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index]
    });
    Class.prototype["getBoolean(OI)Z"] = (function(arg$array, arg$index) {
      return this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index]
    });
    Class.prototype["getByte(OI)B"] = (function(arg$array, arg$index) {
      return (this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] | 0)
    });
    Class.prototype["getChar(OI)C"] = (function(arg$array, arg$index) {
      return (this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] | 0)
    });
    Class.prototype["getShort(OI)S"] = (function(arg$array, arg$index) {
      return (this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] | 0)
    });
    Class.prototype["getInt(OI)I"] = (function(arg$array, arg$index) {
      return (this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] | 0)
    });
    Class.prototype["getLong(OI)J"] = (function(arg$array, arg$index) {
      return $.truncateToLong(this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index])
    });
    Class.prototype["getFloat(OI)F"] = (function(arg$array, arg$index) {
      return this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index]
    });
    Class.prototype["getDouble(OI)D"] = (function(arg$array, arg$index) {
      return this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index]
    });
    Class.prototype["set(OIO)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setBoolean(OIZ)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setByte(OIB)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setChar(OIC)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setShort(OIS)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setInt(OII)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setLong(OIJ)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setFloat(OIF)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["setDouble(OID)V"] = (function(arg$array, arg$index, arg$value) {
      this["getUnderlying(O)Lscala.js.Array;"](arg$array)[arg$index] = arg$value
    });
    Class.prototype["newArray(Ljava.lang.Class;I)O"] = (function(arg$componentType, arg$length) {
      return arg$componentType["env()Lscala.js.Dynamic;"]().newArrayObject(arg$componentType["data()Lscala.js.Dynamic;"]().array, [arg$length])
    });
    Class.prototype["multiNewArray(Ljava.lang.Class;[I)O"] = (function(arg$componentType, arg$dimensions) {
      var lengths$jsid$25281 = this["getUnderlying(O)Lscala.js.Array;"](arg$dimensions);
      var arrayClassData$jsid$25282 = arg$componentType["data()Lscala.js.Dynamic;"]();
      var i$jsid$25283 = 0;
      while ((i$jsid$25283 < lengths$jsid$25281.length)) {
        arrayClassData$jsid$25282 = arrayClassData$jsid$25282.array;
        i$jsid$25283 = (i$jsid$25283 + 1)
      };
      return arg$componentType["env()Lscala.js.Dynamic;"]().newArrayObject(arrayClassData$jsid$25282, lengths$jsid$25281)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["java.lang.reflect.Array"]._instance = this;
      return this
    });
    Class.prototype.newInstance = (function(arg$1, arg$2) {
      if ((typeof(arg$2) === "number")) {
        return this["newInstance(Ljava.lang.Class;I)O"](arg$1, arg$2)
      } else {
        if ($.isInstance(arg$2, "scala.Int[]")) {
          return this["newInstance(Ljava.lang.Class;[I)O"](arg$1, arg$2)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.getLength = (function(arg$1) {
      return this["getLength(O)I"](arg$1)
    });
    Class.prototype.get = (function(arg$1, arg$2) {
      return this["get(OI)O"](arg$1, arg$2)
    });
    Class.prototype.getBoolean = (function(arg$1, arg$2) {
      return this["getBoolean(OI)Z"](arg$1, arg$2)
    });
    Class.prototype.getByte = (function(arg$1, arg$2) {
      return this["getByte(OI)B"](arg$1, arg$2)
    });
    Class.prototype.getChar = (function(arg$1, arg$2) {
      return this["getChar(OI)C"](arg$1, arg$2)
    });
    Class.prototype.getShort = (function(arg$1, arg$2) {
      return this["getShort(OI)S"](arg$1, arg$2)
    });
    Class.prototype.getInt = (function(arg$1, arg$2) {
      return this["getInt(OI)I"](arg$1, arg$2)
    });
    Class.prototype.getLong = (function(arg$1, arg$2) {
      return this["getLong(OI)J"](arg$1, arg$2)
    });
    Class.prototype.getFloat = (function(arg$1, arg$2) {
      return this["getFloat(OI)F"](arg$1, arg$2)
    });
    Class.prototype.getDouble = (function(arg$1, arg$2) {
      return this["getDouble(OI)D"](arg$1, arg$2)
    });
    Class.prototype.set = (function(arg$1, arg$2, arg$3) {
      return this["set(OIO)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setBoolean = (function(arg$1, arg$2, arg$3) {
      return this["setBoolean(OIZ)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setByte = (function(arg$1, arg$2, arg$3) {
      return this["setByte(OIB)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setChar = (function(arg$1, arg$2, arg$3) {
      return this["setChar(OIC)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setShort = (function(arg$1, arg$2, arg$3) {
      return this["setShort(OIS)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setInt = (function(arg$1, arg$2, arg$3) {
      return this["setInt(OII)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setLong = (function(arg$1, arg$2, arg$3) {
      return this["setLong(OIJ)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setFloat = (function(arg$1, arg$2, arg$3) {
      return this["setFloat(OIF)V"](arg$1, arg$2, arg$3)
    });
    Class.prototype.setDouble = (function(arg$1, arg$2, arg$3) {
      return this["setDouble(OID)V"](arg$1, arg$2, arg$3)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.lang.reflect.Array$", Class, JSClass, "java.lang.Object", {
      "java.lang.reflect.Array$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("java.lang.reflect.Array", "java.lang.reflect.Array$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("java.util.NoSuchElementException", (function($) {
    function Class() {
      $.c["java.lang.RuntimeException"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.RuntimeException"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>(TLjava.lang.Throwable;)"] = (function(arg$message, arg$cause) {
      $.c["java.lang.RuntimeException"].prototype["<init>(TLjava.lang.Throwable;)"].call(this, arg$message, arg$cause);
      return this
    });
    Class.prototype["<init>()"] = (function() {
      this["<init>(TLjava.lang.Throwable;)"](null, null);
      return this
    });
    Class.prototype["<init>(T)"] = (function(arg$message) {
      this["<init>(TLjava.lang.Throwable;)"](arg$message, null);
      return this
    });
    Class.prototype["<init>(Ljava.lang.Throwable;)"] = (function(arg$cause) {
      this["<init>(TLjava.lang.Throwable;)"](null, arg$cause);
      return this
    });
    function JSClass(arg$1, arg$2) {
      Class.call(this);
      switch (arguments.length) {
        case 0:
          return this["<init>()"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["<init>(T)"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Throwable")) {
              return this["<init>(Ljava.lang.Throwable;)"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          return this["<init>(TLjava.lang.Throwable;)"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    };
    JSClass.prototype = Class.prototype;
    $.createClass("java.util.NoSuchElementException", Class, JSClass, "java.lang.RuntimeException", {
      "java.util.NoSuchElementException": true,
      "java.lang.RuntimeException": true,
      "java.lang.Exception": true,
      "java.lang.Throwable": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);



(function($) {
  $.registerClass("scala.runtime.BoxedUnit", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["equals(O)Z"] = (function(arg$that) {
      return (this === arg$that)
    });
    Class.prototype["hashCode()I"] = (function() {
      return 0
    });
    Class.prototype["toString()T"] = (function() {
      return "()"
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.runtime.BoxedUnit", Class, JSClass, "java.lang.Object", {
      "scala.runtime.BoxedUnit": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.runtime.BoxedUnit$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$UNIT = null;
      this.$jsfield$TYPE = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["UNIT()Lscala.runtime.BoxedUnit;"] = (function() {
      return this.$jsfield$UNIT
    });
    Class.prototype["TYPE()Ljava.lang.Class;"] = (function() {
      return this.$jsfield$TYPE
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.runtime.BoxedUnit"]._instance = this;
      this.$jsfield$UNIT = new $.c["scala.runtime.BoxedUnit"]()["<init>()"]();
      this.$jsfield$TYPE = $.m["java.lang.Void"]["TYPE()Ljava.lang.Class;"]();
      return this
    });
    Class.prototype.UNIT = (function() {
      return this["UNIT()Lscala.runtime.BoxedUnit;"]()
    });
    Class.prototype.TYPE = (function() {
      return this["TYPE()Ljava.lang.Class;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.runtime.BoxedUnit$", Class, JSClass, "java.lang.Object", {
      "scala.runtime.BoxedUnit$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.runtime.BoxedUnit", "scala.runtime.BoxedUnit$")
})($ScalaJSEnvironment);


(function($) {
  $.registerClass("scala.package$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$AnyRef = null;
      this.$jsfield$Traversable = null;
      this.$jsfield$Iterable = null;
      this.$jsfield$Seq = null;
      this.$jsfield$IndexedSeq = null;
      this.$jsfield$Iterator = null;
      this.$jsfield$List = null;
      this.$jsfield$Nil = null;
      this.$jsfield$$colon$colon = null;
      this.$jsfield$$plus$colon = null;
      this.$jsfield$$colon$plus = null;
      this.$jsfield$Stream = null;
      this.$jsfield$$hash$colon$colon = null;
      this.$jsfield$Vector = null;
      this.$jsfield$StringBuilder = null;
      this.$jsfield$Range = null;
      this.$jsfield$BigDecimal = null;
      this.$jsfield$BigInt = null;
      this.$jsfield$Equiv = null;
      this.$jsfield$Numeric = null;
      this.$jsfield$Ordered = null;
      this.$jsfield$Ordering = null;
      this.$jsfield$Either = null;
      this.$jsfield$Left = null;
      this.$jsfield$Right = null;
      this.$jsfield$bitmap$0 = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["BigDecimal$lzycompute()Lscala.math.BigDecimal$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 1) === 0)) {
        this.$jsfield$BigDecimal = $.m["scala.math.BigDecimal"];
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 1)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$BigDecimal
    });
    Class.prototype["BigInt$lzycompute()Lscala.math.BigInt$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 2) === 0)) {
        this.$jsfield$BigInt = $.m["scala.math.BigInt"];
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 2)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$BigInt
    });
    Class.prototype["AnyRef()Lscala.Specializable;"] = (function() {
      return this.$jsfield$AnyRef
    });
    Class.prototype["Traversable()Lscala.collection.Traversable$;"] = (function() {
      return this.$jsfield$Traversable
    });
    Class.prototype["Iterable()Lscala.collection.Iterable$;"] = (function() {
      return this.$jsfield$Iterable
    });
    Class.prototype["Seq()Lscala.collection.Seq$;"] = (function() {
      return this.$jsfield$Seq
    });
    Class.prototype["IndexedSeq()Lscala.collection.IndexedSeq$;"] = (function() {
      return this.$jsfield$IndexedSeq
    });
    Class.prototype["Iterator()Lscala.collection.Iterator$;"] = (function() {
      return this.$jsfield$Iterator
    });
    Class.prototype["List()Lscala.collection.immutable.List$;"] = (function() {
      return this.$jsfield$List
    });
    Class.prototype["Nil()Lscala.collection.immutable.Nil$;"] = (function() {
      return this.$jsfield$Nil
    });
    Class.prototype["::()Lscala.collection.immutable.::$;"] = (function() {
      return this.$jsfield$$colon$colon
    });
    Class.prototype["+:()Lscala.collection.+:$;"] = (function() {
      return this.$jsfield$$plus$colon
    });
    Class.prototype[":+()Lscala.collection.:+$;"] = (function() {
      return this.$jsfield$$colon$plus
    });
    Class.prototype["Stream()Lscala.collection.immutable.Stream$;"] = (function() {
      return this.$jsfield$Stream
    });
    Class.prototype["#::()Lscala.collection.immutable.Stream$#::$;"] = (function() {
      return this.$jsfield$$hash$colon$colon
    });
    Class.prototype["Vector()Lscala.collection.immutable.Vector$;"] = (function() {
      return this.$jsfield$Vector
    });
    Class.prototype["StringBuilder()Lscala.collection.mutable.StringBuilder$;"] = (function() {
      return this.$jsfield$StringBuilder
    });
    Class.prototype["Range()Lscala.collection.immutable.Range$;"] = (function() {
      return this.$jsfield$Range
    });
    Class.prototype["BigDecimal()Lscala.math.BigDecimal$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 1) === 0)) {
        return this["BigDecimal$lzycompute()Lscala.math.BigDecimal$;"]()
      } else {
        return this.$jsfield$BigDecimal
      }
    });
    Class.prototype["BigInt()Lscala.math.BigInt$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 2) === 0)) {
        return this["BigInt$lzycompute()Lscala.math.BigInt$;"]()
      } else {
        return this.$jsfield$BigInt
      }
    });
    Class.prototype["Equiv()Lscala.math.Equiv$;"] = (function() {
      return this.$jsfield$Equiv
    });
    Class.prototype["Numeric()Lscala.math.Numeric$;"] = (function() {
      return this.$jsfield$Numeric
    });
    Class.prototype["Ordered()Lscala.math.Ordered$;"] = (function() {
      return this.$jsfield$Ordered
    });
    Class.prototype["Ordering()Lscala.math.Ordering$;"] = (function() {
      return this.$jsfield$Ordering
    });
    Class.prototype["Either()Lscala.util.Either$;"] = (function() {
      return this.$jsfield$Either
    });
    Class.prototype["Left()Lscala.util.Left$;"] = (function() {
      return this.$jsfield$Left
    });
    Class.prototype["Right()Lscala.util.Right$;"] = (function() {
      return this.$jsfield$Right
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.package"]._instance = this;
      var jsx$1 = new $.c["scala.package$$anon$1"]()["<init>()"]();
      this.$jsfield$AnyRef = jsx$1;
      this.$jsfield$Traversable = $.m["scala.collection.Traversable"];
      this.$jsfield$Iterable = $.m["scala.collection.Iterable"];
      this.$jsfield$Seq = $.m["scala.collection.Seq"];
      this.$jsfield$IndexedSeq = $.m["scala.collection.IndexedSeq"];
      this.$jsfield$Iterator = $.m["scala.collection.Iterator"];
      this.$jsfield$List = $.m["scala.collection.immutable.List"];
      this.$jsfield$Nil = $.m["scala.collection.immutable.Nil"];
      this.$jsfield$$colon$colon = $.m["scala.collection.immutable.::"];
      this.$jsfield$$plus$colon = $.m["scala.collection.+:"];
      this.$jsfield$$colon$plus = $.m["scala.collection.:+"];
      this.$jsfield$Stream = $.m["scala.collection.immutable.Stream"];
      this.$jsfield$$hash$colon$colon = $.m["scala.collection.immutable.Stream$#::"];
      this.$jsfield$Vector = $.m["scala.collection.immutable.Vector"];
      this.$jsfield$StringBuilder = $.m["scala.collection.mutable.StringBuilder"];
      this.$jsfield$Range = $.m["scala.collection.immutable.Range"];
      this.$jsfield$Equiv = $.m["scala.math.Equiv"];
      this.$jsfield$Numeric = $.m["scala.math.Numeric"];
      this.$jsfield$Ordered = $.m["scala.math.Ordered"];
      this.$jsfield$Ordering = $.m["scala.math.Ordering"];
      this.$jsfield$Either = $.m["scala.util.Either"];
      this.$jsfield$Left = $.m["scala.util.Left"];
      this.$jsfield$Right = $.m["scala.util.Right"];
      return this
    });
    Class.prototype.AnyRef = (function() {
      return this["AnyRef()Lscala.Specializable;"]()
    });
    Class.prototype.Traversable = (function() {
      return this["Traversable()Lscala.collection.Traversable$;"]()
    });
    Class.prototype.Iterable = (function() {
      return this["Iterable()Lscala.collection.Iterable$;"]()
    });
    Class.prototype.Seq = (function() {
      return this["Seq()Lscala.collection.Seq$;"]()
    });
    Class.prototype.IndexedSeq = (function() {
      return this["IndexedSeq()Lscala.collection.IndexedSeq$;"]()
    });
    Class.prototype.Iterator = (function() {
      return this["Iterator()Lscala.collection.Iterator$;"]()
    });
    Class.prototype.List = (function() {
      return this["List()Lscala.collection.immutable.List$;"]()
    });
    Class.prototype.Nil = (function() {
      return this["Nil()Lscala.collection.immutable.Nil$;"]()
    });
    Class.prototype["::"] = (function() {
      return this["::()Lscala.collection.immutable.::$;"]()
    });
    Class.prototype["+:"] = (function() {
      return this["+:()Lscala.collection.+:$;"]()
    });
    Class.prototype[":+"] = (function() {
      return this[":+()Lscala.collection.:+$;"]()
    });
    Class.prototype.Stream = (function() {
      return this["Stream()Lscala.collection.immutable.Stream$;"]()
    });
    Class.prototype["#::"] = (function() {
      return this["#::()Lscala.collection.immutable.Stream$#::$;"]()
    });
    Class.prototype.Vector = (function() {
      return this["Vector()Lscala.collection.immutable.Vector$;"]()
    });
    Class.prototype.StringBuilder = (function() {
      return this["StringBuilder()Lscala.collection.mutable.StringBuilder$;"]()
    });
    Class.prototype.Range = (function() {
      return this["Range()Lscala.collection.immutable.Range$;"]()
    });
    Class.prototype.BigDecimal = (function() {
      return this["BigDecimal()Lscala.math.BigDecimal$;"]()
    });
    Class.prototype.BigInt = (function() {
      return this["BigInt()Lscala.math.BigInt$;"]()
    });
    Class.prototype.Equiv = (function() {
      return this["Equiv()Lscala.math.Equiv$;"]()
    });
    Class.prototype.Numeric = (function() {
      return this["Numeric()Lscala.math.Numeric$;"]()
    });
    Class.prototype.Ordered = (function() {
      return this["Ordered()Lscala.math.Ordered$;"]()
    });
    Class.prototype.Ordering = (function() {
      return this["Ordering()Lscala.math.Ordering$;"]()
    });
    Class.prototype.Either = (function() {
      return this["Either()Lscala.util.Either$;"]()
    });
    Class.prototype.Left = (function() {
      return this["Left()Lscala.util.Left$;"]()
    });
    Class.prototype.Right = (function() {
      return this["Right()Lscala.util.Right$;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.package$", Class, JSClass, "java.lang.Object", {
      "scala.package$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.package", "scala.package$");
  $.registerClass("scala.package$$anon$1", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["toString()T"] = (function() {
      return "object AnyRef"
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.package$$anon$1", Class, JSClass, "java.lang.Object", {
      "scala.package$$anon$1": true,
      "scala.Specializable": true,
      "scala.SpecializableCompanion": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.Predef$", (function($) {
    function Class() {
      $.c["scala.LowPriorityImplicits"].prototype.constructor.call(this);
      this.$jsfield$Map = null;
      this.$jsfield$Set = null;
      this.$jsfield$ClassManifest = null;
      this.$jsfield$Manifest = null;
      this.$jsfield$NoManifest = null;
      this.$jsfield$$scope = null;
      this.$jsfield$StringCanBuildFrom = null;
      this.$jsfield$singleton_$less$colon$less = null;
      this.$jsfield$scala$Predef$$singleton_$eq$colon$eq = null;
      this.$jsfield$bitmap$0 = 0
    };
    Class.prototype = Object.create($.c["scala.LowPriorityImplicits"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["Map$lzycompute()Lscala.collection.immutable.Map$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 1) === 0)) {
        this.$jsfield$Map = $.m["scala.collection.immutable.Map"];
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 1)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$Map
    });
    Class.prototype["Set$lzycompute()Lscala.collection.immutable.Set$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 2) === 0)) {
        this.$jsfield$Set = $.m["scala.collection.immutable.Set"];
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 2)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$Set
    });
    Class.prototype["ClassManifest$lzycompute()Lscala.reflect.ClassManifestFactory$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 4) === 0)) {
        this.$jsfield$ClassManifest = $.m["scala.reflect.package"]["ClassManifest()Lscala.reflect.ClassManifestFactory$;"]();
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 4)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$ClassManifest
    });
    Class.prototype["Manifest$lzycompute()Lscala.reflect.ManifestFactory$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 8) === 0)) {
        this.$jsfield$Manifest = $.m["scala.reflect.package"]["Manifest()Lscala.reflect.ManifestFactory$;"]();
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 8)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$Manifest
    });
    Class.prototype["NoManifest$lzycompute()Lscala.reflect.NoManifest$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 16) === 0)) {
        this.$jsfield$NoManifest = $.m["scala.reflect.NoManifest"];
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 16)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$NoManifest
    });
    Class.prototype["$scope$lzycompute()Lscala.xml.TopScope$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 32) === 0)) {
        this.$jsfield$$scope = $.m["scala.xml.TopScope"];
        this.$jsfield$bitmap$0 = (this.$jsfield$bitmap$0 | 32)
      } else {
        /*<skip>*/
      };
      $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
      return this.$jsfield$$scope
    });
    Class.prototype["classOf()Ljava.lang.Class;"] = (function() {
      return null
    });
    Class.prototype["Map()Lscala.collection.immutable.Map$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 1) === 0)) {
        return this["Map$lzycompute()Lscala.collection.immutable.Map$;"]()
      } else {
        return this.$jsfield$Map
      }
    });
    Class.prototype["Set()Lscala.collection.immutable.Set$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 2) === 0)) {
        return this["Set$lzycompute()Lscala.collection.immutable.Set$;"]()
      } else {
        return this.$jsfield$Set
      }
    });
    Class.prototype["ClassManifest()Lscala.reflect.ClassManifestFactory$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 4) === 0)) {
        return this["ClassManifest$lzycompute()Lscala.reflect.ClassManifestFactory$;"]()
      } else {
        return this.$jsfield$ClassManifest
      }
    });
    Class.prototype["Manifest()Lscala.reflect.ManifestFactory$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 8) === 0)) {
        return this["Manifest$lzycompute()Lscala.reflect.ManifestFactory$;"]()
      } else {
        return this.$jsfield$Manifest
      }
    });
    Class.prototype["NoManifest()Lscala.reflect.NoManifest$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 16) === 0)) {
        return this["NoManifest$lzycompute()Lscala.reflect.NoManifest$;"]()
      } else {
        return this.$jsfield$NoManifest
      }
    });
    Class.prototype["manifest(Lscala.reflect.Manifest;)Lscala.reflect.Manifest;"] = (function(arg$m) {
      return arg$m
    });
    Class.prototype["classManifest(Lscala.reflect.ClassTag;)Lscala.reflect.ClassTag;"] = (function(arg$m) {
      return arg$m
    });
    Class.prototype["optManifest(Lscala.reflect.OptManifest;)Lscala.reflect.OptManifest;"] = (function(arg$m) {
      return arg$m
    });
    Class.prototype["identity(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["implicitly(O)O"] = (function(arg$e) {
      return arg$e
    });
    Class.prototype["locally(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["$scope()Lscala.xml.TopScope$;"] = (function() {
      if (((this.$jsfield$bitmap$0 & 32) === 0)) {
        return this["$scope$lzycompute()Lscala.xml.TopScope$;"]()
      } else {
        return this.$jsfield$$scope
      }
    });
    Class.prototype["error(T)Lscala.Nothing;"] = (function(arg$message) {
      return $.m["scala.sys.package"]["error(T)Lscala.Nothing;"](arg$message)
    });
    Class.prototype["exit()Lscala.Nothing;"] = (function() {
      return $.m["scala.sys.package"]["exit()Lscala.Nothing;"]()
    });
    Class.prototype["exit(I)Lscala.Nothing;"] = (function(arg$status) {
      return $.m["scala.sys.package"]["exit(I)Lscala.Nothing;"](arg$status)
    });
    Class.prototype["format(TLscala.collection.Seq;)T"] = (function(arg$text, arg$xs) {
      return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"](this["augmentString(T)T"](arg$text))["format(Lscala.collection.Seq;)T"](arg$xs)
    });
    Class.prototype["assert(Z)V"] = (function(arg$assertion) {
      if ((!arg$assertion)) {
        throw new $.c["java.lang.AssertionError"]()["<init>(O)"]("assertion failed")
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["assert(ZLscala.Function0;)V"] = (function(arg$assertion, arg$message) {
      if ((!arg$assertion)) {
        throw new $.c["java.lang.AssertionError"]()["<init>(O)"](("assertion failed: " + arg$message["apply()O"]()))
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["assume(Z)V"] = (function(arg$assumption) {
      if ((!arg$assumption)) {
        throw new $.c["java.lang.AssertionError"]()["<init>(O)"]("assumption failed")
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["assume(ZLscala.Function0;)V"] = (function(arg$assumption, arg$message) {
      if ((!arg$assumption)) {
        throw new $.c["java.lang.AssertionError"]()["<init>(O)"](("assumption failed: " + arg$message["apply()O"]()))
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["require(Z)V"] = (function(arg$requirement) {
      if ((!arg$requirement)) {
        throw new $.c["java.lang.IllegalArgumentException"]()["<init>(T)"]("requirement failed")
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["require(ZLscala.Function0;)V"] = (function(arg$requirement, arg$message) {
      if ((!arg$requirement)) {
        throw new $.c["java.lang.IllegalArgumentException"]()["<init>(T)"](("requirement failed: " + arg$message["apply()O"]()))
      } else {
        /*<skip>*/
      }
    });
    Class.prototype["any2Ensuring(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["???()Lscala.Nothing;"] = (function() {
      throw new $.c["scala.NotImplementedError"]()["<init>()"]()
    });
    Class.prototype["any2ArrowAssoc(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["print(O)V"] = (function(arg$x) {
      $.m["scala.Console"]["print(O)V"](arg$x)
    });
    Class.prototype["println()V"] = (function() {
      $.m["scala.Console"]["println()V"]()
    });
    Class.prototype["println(O)V"] = (function(arg$x) {
      $.m["scala.Console"]["println(O)V"](arg$x)
    });
    Class.prototype["printf(TLscala.collection.Seq;)V"] = (function(arg$text, arg$xs) {
      $.m["scala.Console"]["print(O)V"](new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"](this["augmentString(T)T"](arg$text))["format(Lscala.collection.Seq;)T"](arg$xs))
    });
    Class.prototype["readLine()T"] = (function() {
      return $.m["scala.Console"]["readLine()T"]()
    });
    Class.prototype["readLine(TLscala.collection.Seq;)T"] = (function(arg$text, arg$args) {
      return $.m["scala.Console"]["readLine(TLscala.collection.Seq;)T"](arg$text, arg$args)
    });
    Class.prototype["readBoolean()Z"] = (function() {
      return $.m["scala.Console"]["readBoolean()Z"]()
    });
    Class.prototype["readByte()B"] = (function() {
      return $.m["scala.Console"]["readByte()B"]()
    });
    Class.prototype["readShort()S"] = (function() {
      return $.m["scala.Console"]["readShort()S"]()
    });
    Class.prototype["readChar()C"] = (function() {
      return $.m["scala.Console"]["readChar()C"]()
    });
    Class.prototype["readInt()I"] = (function() {
      return $.m["scala.Console"]["readInt()I"]()
    });
    Class.prototype["readLong()J"] = (function() {
      return $.m["scala.Console"]["readLong()J"]()
    });
    Class.prototype["readFloat()F"] = (function() {
      return $.m["scala.Console"]["readFloat()F"]()
    });
    Class.prototype["readDouble()D"] = (function() {
      return $.m["scala.Console"]["readDouble()D"]()
    });
    Class.prototype["readf(T)Lscala.collection.immutable.List;"] = (function(arg$format) {
      return $.m["scala.Console"]["readf(T)Lscala.collection.immutable.List;"](arg$format)
    });
    Class.prototype["readf1(T)O"] = (function(arg$format) {
      return $.m["scala.Console"]["readf1(T)O"](arg$format)
    });
    Class.prototype["readf2(T)Lscala.Tuple2;"] = (function(arg$format) {
      return $.m["scala.Console"]["readf2(T)Lscala.Tuple2;"](arg$format)
    });
    Class.prototype["readf3(T)Lscala.Tuple3;"] = (function(arg$format) {
      return $.m["scala.Console"]["readf3(T)Lscala.Tuple3;"](arg$format)
    });
    Class.prototype["exceptionWrapper(Ljava.lang.Throwable;)Lscala.runtime.RichException;"] = (function(arg$exc) {
      return new $.c["scala.runtime.RichException"]()["<init>(Ljava.lang.Throwable;)"](arg$exc)
    });
    Class.prototype["tuple2ToZippedOps(Lscala.Tuple2;)Lscala.Tuple2;"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["tuple3ToZippedOps(Lscala.Tuple3;)Lscala.Tuple3;"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["seqToCharSequence(Lscala.collection.IndexedSeq;)Ljava.lang.CharSequence;"] = (function(arg$xs) {
      return new $.c["scala.runtime.SeqCharSequence"]()["<init>(Lscala.collection.IndexedSeq;)"](arg$xs)
    });
    Class.prototype["arrayToCharSequence([C)Ljava.lang.CharSequence;"] = (function(arg$xs) {
      return new $.c["scala.runtime.ArrayCharSequence"]()["<init>([CII)"](arg$xs, 0, arg$xs.underlying.length)
    });
    Class.prototype["genericArrayOps(O)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      var x1$jsid$38245 = arg$xs;
      var result$$jslabel$matchEnd14$38280;
      $jslabel$matchEnd14$38280: do {
        if ($.isInstance(x1$jsid$38245, "java.lang.Object[]")) {
          var x2$jsid$38268 = $.asInstance(x1$jsid$38245, "java.lang.Object[]");
          result$$jslabel$matchEnd14$38280 = this["refArrayOps([O)Lscala.collection.mutable.ArrayOps;"](x2$jsid$38268);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Boolean[]")) {
          var x3$jsid$38269 = $.asInstance(x1$jsid$38245, "scala.Boolean[]");
          result$$jslabel$matchEnd14$38280 = this["booleanArrayOps([Z)Lscala.collection.mutable.ArrayOps;"](x3$jsid$38269);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Byte[]")) {
          var x4$jsid$38270 = $.asInstance(x1$jsid$38245, "scala.Byte[]");
          result$$jslabel$matchEnd14$38280 = this["byteArrayOps([B)Lscala.collection.mutable.ArrayOps;"](x4$jsid$38270);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Char[]")) {
          var x5$jsid$38271 = $.asInstance(x1$jsid$38245, "scala.Char[]");
          result$$jslabel$matchEnd14$38280 = this["charArrayOps([C)Lscala.collection.mutable.ArrayOps;"](x5$jsid$38271);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Double[]")) {
          var x6$jsid$38272 = $.asInstance(x1$jsid$38245, "scala.Double[]");
          result$$jslabel$matchEnd14$38280 = this["doubleArrayOps([D)Lscala.collection.mutable.ArrayOps;"](x6$jsid$38272);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Float[]")) {
          var x7$jsid$38273 = $.asInstance(x1$jsid$38245, "scala.Float[]");
          result$$jslabel$matchEnd14$38280 = this["floatArrayOps([F)Lscala.collection.mutable.ArrayOps;"](x7$jsid$38273);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Int[]")) {
          var x8$jsid$38274 = $.asInstance(x1$jsid$38245, "scala.Int[]");
          result$$jslabel$matchEnd14$38280 = this["intArrayOps([I)Lscala.collection.mutable.ArrayOps;"](x8$jsid$38274);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Long[]")) {
          var x9$jsid$38275 = $.asInstance(x1$jsid$38245, "scala.Long[]");
          result$$jslabel$matchEnd14$38280 = this["longArrayOps([J)Lscala.collection.mutable.ArrayOps;"](x9$jsid$38275);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.Short[]")) {
          var x10$jsid$38276 = $.asInstance(x1$jsid$38245, "scala.Short[]");
          result$$jslabel$matchEnd14$38280 = this["shortArrayOps([S)Lscala.collection.mutable.ArrayOps;"](x10$jsid$38276);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38245, "scala.runtime.BoxedUnit[]")) {
          var x11$jsid$38277 = $.asInstance(x1$jsid$38245, "scala.runtime.BoxedUnit[]");
          result$$jslabel$matchEnd14$38280 = this["unitArrayOps([Lscala.runtime.BoxedUnit;)Lscala.collection.mutable.ArrayOps;"](x11$jsid$38277);
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        if ((null === x1$jsid$38245)) {
          result$$jslabel$matchEnd14$38280 = null;
          break $jslabel$matchEnd14$38280
        } else {
          /*<skip>*/
        };
        throw new $.c["scala.MatchError"]()["<init>(O)"](x1$jsid$38245);
        break $jslabel$matchEnd14$38280
      } while (false);
      return result$$jslabel$matchEnd14$38280
    });
    Class.prototype["booleanArrayOps([Z)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofBoolean"]()["<init>([Z)"](arg$xs)
    });
    Class.prototype["byteArrayOps([B)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofByte"]()["<init>([B)"](arg$xs)
    });
    Class.prototype["charArrayOps([C)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofChar"]()["<init>([C)"](arg$xs)
    });
    Class.prototype["doubleArrayOps([D)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofDouble"]()["<init>([D)"](arg$xs)
    });
    Class.prototype["floatArrayOps([F)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofFloat"]()["<init>([F)"](arg$xs)
    });
    Class.prototype["intArrayOps([I)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofInt"]()["<init>([I)"](arg$xs)
    });
    Class.prototype["longArrayOps([J)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofLong"]()["<init>([J)"](arg$xs)
    });
    Class.prototype["refArrayOps([O)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofRef"]()["<init>([O)"](arg$xs)
    });
    Class.prototype["shortArrayOps([S)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofShort"]()["<init>([S)"](arg$xs)
    });
    Class.prototype["unitArrayOps([Lscala.runtime.BoxedUnit;)Lscala.collection.mutable.ArrayOps;"] = (function(arg$xs) {
      return new $.c["scala.collection.mutable.ArrayOps$ofUnit"]()["<init>([Lscala.runtime.BoxedUnit;)"](arg$xs)
    });
    Class.prototype["byte2short(B)S"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["byte2int(B)I"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["byte2long(B)J"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["byte2float(B)F"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["byte2double(B)D"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["short2int(S)I"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["short2long(S)J"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["short2float(S)F"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["short2double(S)D"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["char2int(C)I"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["char2long(C)J"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["char2float(C)F"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["char2double(C)D"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["int2long(I)J"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["int2float(I)F"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["int2double(I)D"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["long2float(J)F"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["long2double(J)D"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["float2double(F)D"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["byte2Byte(B)Ljava.lang.Byte;"] = (function(arg$x) {
      return $.m["java.lang.Byte"]["valueOf(B)Ljava.lang.Byte;"](arg$x)
    });
    Class.prototype["short2Short(S)Ljava.lang.Short;"] = (function(arg$x) {
      return $.m["java.lang.Short"]["valueOf(S)Ljava.lang.Short;"](arg$x)
    });
    Class.prototype["char2Character(C)Ljava.lang.Character;"] = (function(arg$x) {
      return $.m["java.lang.Character"]["valueOf(C)Ljava.lang.Character;"](arg$x)
    });
    Class.prototype["int2Integer(I)Ljava.lang.Integer;"] = (function(arg$x) {
      return $.m["java.lang.Integer"]["valueOf(I)Ljava.lang.Integer;"](arg$x)
    });
    Class.prototype["long2Long(J)Ljava.lang.Long;"] = (function(arg$x) {
      return $.m["java.lang.Long"]["valueOf(J)Ljava.lang.Long;"](arg$x)
    });
    Class.prototype["float2Float(F)Ljava.lang.Float;"] = (function(arg$x) {
      return $.m["java.lang.Float"]["valueOf(F)Ljava.lang.Float;"](arg$x)
    });
    Class.prototype["double2Double(D)Ljava.lang.Double;"] = (function(arg$x) {
      return $.m["java.lang.Double"]["valueOf(D)Ljava.lang.Double;"](arg$x)
    });
    Class.prototype["boolean2Boolean(Z)Ljava.lang.Boolean;"] = (function(arg$x) {
      return $.m["java.lang.Boolean"]["valueOf(Z)Ljava.lang.Boolean;"](arg$x)
    });
    Class.prototype["byte2ByteConflict(B)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["short2ShortConflict(S)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["char2CharacterConflict(C)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["int2IntegerConflict(I)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["long2LongConflict(J)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["float2FloatConflict(F)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["double2DoubleConflict(D)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["boolean2BooleanConflict(Z)O"] = (function(arg$x) {
      return new $.c["java.lang.Object"]()["<init>()"]()
    });
    Class.prototype["Byte2byte(Ljava.lang.Byte;)B"] = (function(arg$x) {
      return arg$x["byteValue()B"]()
    });
    Class.prototype["Short2short(Ljava.lang.Short;)S"] = (function(arg$x) {
      return arg$x["shortValue()S"]()
    });
    Class.prototype["Character2char(Ljava.lang.Character;)C"] = (function(arg$x) {
      return arg$x["charValue()C"]()
    });
    Class.prototype["Integer2int(Ljava.lang.Integer;)I"] = (function(arg$x) {
      return arg$x["intValue()I"]()
    });
    Class.prototype["Long2long(Ljava.lang.Long;)J"] = (function(arg$x) {
      return arg$x["longValue()J"]()
    });
    Class.prototype["Float2float(Ljava.lang.Float;)F"] = (function(arg$x) {
      return arg$x["floatValue()F"]()
    });
    Class.prototype["Double2double(Ljava.lang.Double;)D"] = (function(arg$x) {
      return arg$x["doubleValue()D"]()
    });
    Class.prototype["Boolean2boolean(Ljava.lang.Boolean;)Z"] = (function(arg$x) {
      return arg$x["booleanValue()Z"]()
    });
    Class.prototype["any2stringfmt(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["augmentString(T)T"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["any2stringadd(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["unaugmentString(T)T"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["stringCanBuildFrom()Lscala.collection.generic.CanBuildFrom;"] = (function() {
      return this["StringCanBuildFrom()Lscala.collection.generic.CanBuildFrom;"]()
    });
    Class.prototype["StringCanBuildFrom()Lscala.collection.generic.CanBuildFrom;"] = (function() {
      return this.$jsfield$StringCanBuildFrom
    });
    Class.prototype["conforms()Lscala.Predef$<:<;"] = (function() {
      return this.$jsfield$singleton_$less$colon$less
    });
    Class.prototype["<init>()"] = (function() {
      $.c["scala.LowPriorityImplicits"].prototype["<init>()"].call(this);
      $.modules["scala.Predef"]._instance = this;
      $.m["scala.package"];
      $.m["scala.collection.immutable.List"];
      var jsx$1 = new $.c["scala.Predef$$anon$3"]()["<init>()"]();
      this.$jsfield$StringCanBuildFrom = jsx$1;
      var jsx$2 = new $.c["scala.Predef$$anon$1"]()["<init>()"]();
      this.$jsfield$singleton_$less$colon$less = jsx$2;
      var jsx$3 = new $.c["scala.Predef$$anon$2"]()["<init>()"]();
      this.$jsfield$scala$Predef$$singleton_$eq$colon$eq = jsx$3;
      return this
    });
    Class.prototype.classOf = (function() {
      return this["classOf()Ljava.lang.Class;"]()
    });
    Class.prototype.Map = (function() {
      return this["Map()Lscala.collection.immutable.Map$;"]()
    });
    Class.prototype.Set = (function() {
      return this["Set()Lscala.collection.immutable.Set$;"]()
    });
    Class.prototype.ClassManifest = (function() {
      return this["ClassManifest()Lscala.reflect.ClassManifestFactory$;"]()
    });
    Class.prototype.Manifest = (function() {
      return this["Manifest()Lscala.reflect.ManifestFactory$;"]()
    });
    Class.prototype.NoManifest = (function() {
      return this["NoManifest()Lscala.reflect.NoManifest$;"]()
    });
    Class.prototype.manifest = (function(arg$1) {
      return this["manifest(Lscala.reflect.Manifest;)Lscala.reflect.Manifest;"](arg$1)
    });
    Class.prototype.classManifest = (function(arg$1) {
      return this["classManifest(Lscala.reflect.ClassTag;)Lscala.reflect.ClassTag;"](arg$1)
    });
    Class.prototype.optManifest = (function(arg$1) {
      return this["optManifest(Lscala.reflect.OptManifest;)Lscala.reflect.OptManifest;"](arg$1)
    });
    Class.prototype.identity = (function(arg$1) {
      return this["identity(O)O"](arg$1)
    });
    Class.prototype.implicitly = (function(arg$1) {
      return this["implicitly(O)O"](arg$1)
    });
    Class.prototype.locally = (function(arg$1) {
      return this["locally(O)O"](arg$1)
    });
    Class.prototype.$scope = (function() {
      return this["$scope()Lscala.xml.TopScope$;"]()
    });
    Class.prototype.error = (function(arg$1) {
      return this["error(T)Lscala.Nothing;"](arg$1)
    });
    Class.prototype.exit = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["exit()Lscala.Nothing;"]();
        case 1:
          return this["exit(I)Lscala.Nothing;"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.format = (function(arg$1, arg$2) {
      return this["format(TLscala.collection.Seq;)T"](arg$1, arg$2)
    });
    Class.prototype.assert = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          return this["assert(Z)V"](arg$1);
        case 2:
          return this["assert(ZLscala.Function0;)V"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.assume = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          return this["assume(Z)V"](arg$1);
        case 2:
          return this["assume(ZLscala.Function0;)V"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.require = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          return this["require(Z)V"](arg$1);
        case 2:
          return this["require(ZLscala.Function0;)V"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.any2Ensuring = (function(arg$1) {
      return this["any2Ensuring(O)O"](arg$1)
    });
    Class.prototype["???"] = (function() {
      return this["???()Lscala.Nothing;"]()
    });
    Class.prototype.any2ArrowAssoc = (function(arg$1) {
      return this["any2ArrowAssoc(O)O"](arg$1)
    });
    Class.prototype.print = (function(arg$1) {
      return this["print(O)V"](arg$1)
    });
    Class.prototype.println = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["println()V"]();
        case 1:
          return this["println(O)V"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.printf = (function(arg$1, arg$2) {
      return this["printf(TLscala.collection.Seq;)V"](arg$1, arg$2)
    });
    Class.prototype.readLine = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 0:
          return this["readLine()T"]();
        case 2:
          return this["readLine(TLscala.collection.Seq;)T"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.readBoolean = (function() {
      return this["readBoolean()Z"]()
    });
    Class.prototype.readByte = (function() {
      return this["readByte()B"]()
    });
    Class.prototype.readShort = (function() {
      return this["readShort()S"]()
    });
    Class.prototype.readChar = (function() {
      return this["readChar()C"]()
    });
    Class.prototype.readInt = (function() {
      return this["readInt()I"]()
    });
    Class.prototype.readLong = (function() {
      return this["readLong()J"]()
    });
    Class.prototype.readFloat = (function() {
      return this["readFloat()F"]()
    });
    Class.prototype.readDouble = (function() {
      return this["readDouble()D"]()
    });
    Class.prototype.readf = (function(arg$1) {
      return this["readf(T)Lscala.collection.immutable.List;"](arg$1)
    });
    Class.prototype.readf1 = (function(arg$1) {
      return this["readf1(T)O"](arg$1)
    });
    Class.prototype.readf2 = (function(arg$1) {
      return this["readf2(T)Lscala.Tuple2;"](arg$1)
    });
    Class.prototype.readf3 = (function(arg$1) {
      return this["readf3(T)Lscala.Tuple3;"](arg$1)
    });
    Class.prototype.exceptionWrapper = (function(arg$1) {
      return this["exceptionWrapper(Ljava.lang.Throwable;)Lscala.runtime.RichException;"](arg$1)
    });
    Class.prototype.tuple2ToZippedOps = (function(arg$1) {
      return this["tuple2ToZippedOps(Lscala.Tuple2;)Lscala.Tuple2;"](arg$1)
    });
    Class.prototype.tuple3ToZippedOps = (function(arg$1) {
      return this["tuple3ToZippedOps(Lscala.Tuple3;)Lscala.Tuple3;"](arg$1)
    });
    Class.prototype.seqToCharSequence = (function(arg$1) {
      return this["seqToCharSequence(Lscala.collection.IndexedSeq;)Ljava.lang.CharSequence;"](arg$1)
    });
    Class.prototype.arrayToCharSequence = (function(arg$1) {
      return this["arrayToCharSequence([C)Ljava.lang.CharSequence;"](arg$1)
    });
    Class.prototype.genericArrayOps = (function(arg$1) {
      return this["genericArrayOps(O)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.booleanArrayOps = (function(arg$1) {
      return this["booleanArrayOps([Z)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.byteArrayOps = (function(arg$1) {
      return this["byteArrayOps([B)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.charArrayOps = (function(arg$1) {
      return this["charArrayOps([C)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.doubleArrayOps = (function(arg$1) {
      return this["doubleArrayOps([D)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.floatArrayOps = (function(arg$1) {
      return this["floatArrayOps([F)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.intArrayOps = (function(arg$1) {
      return this["intArrayOps([I)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.longArrayOps = (function(arg$1) {
      return this["longArrayOps([J)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.refArrayOps = (function(arg$1) {
      return this["refArrayOps([O)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.shortArrayOps = (function(arg$1) {
      return this["shortArrayOps([S)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.unitArrayOps = (function(arg$1) {
      return this["unitArrayOps([Lscala.runtime.BoxedUnit;)Lscala.collection.mutable.ArrayOps;"](arg$1)
    });
    Class.prototype.byte2short = (function(arg$1) {
      return this["byte2short(B)S"](arg$1)
    });
    Class.prototype.byte2int = (function(arg$1) {
      return this["byte2int(B)I"](arg$1)
    });
    Class.prototype.byte2long = (function(arg$1) {
      return this["byte2long(B)J"](arg$1)
    });
    Class.prototype.byte2float = (function(arg$1) {
      return this["byte2float(B)F"](arg$1)
    });
    Class.prototype.byte2double = (function(arg$1) {
      return this["byte2double(B)D"](arg$1)
    });
    Class.prototype.short2int = (function(arg$1) {
      return this["short2int(S)I"](arg$1)
    });
    Class.prototype.short2long = (function(arg$1) {
      return this["short2long(S)J"](arg$1)
    });
    Class.prototype.short2float = (function(arg$1) {
      return this["short2float(S)F"](arg$1)
    });
    Class.prototype.short2double = (function(arg$1) {
      return this["short2double(S)D"](arg$1)
    });
    Class.prototype.char2int = (function(arg$1) {
      return this["char2int(C)I"](arg$1)
    });
    Class.prototype.char2long = (function(arg$1) {
      return this["char2long(C)J"](arg$1)
    });
    Class.prototype.char2float = (function(arg$1) {
      return this["char2float(C)F"](arg$1)
    });
    Class.prototype.char2double = (function(arg$1) {
      return this["char2double(C)D"](arg$1)
    });
    Class.prototype.int2long = (function(arg$1) {
      return this["int2long(I)J"](arg$1)
    });
    Class.prototype.int2float = (function(arg$1) {
      return this["int2float(I)F"](arg$1)
    });
    Class.prototype.int2double = (function(arg$1) {
      return this["int2double(I)D"](arg$1)
    });
    Class.prototype.long2float = (function(arg$1) {
      return this["long2float(J)F"](arg$1)
    });
    Class.prototype.long2double = (function(arg$1) {
      return this["long2double(J)D"](arg$1)
    });
    Class.prototype.float2double = (function(arg$1) {
      return this["float2double(F)D"](arg$1)
    });
    Class.prototype.byte2Byte = (function(arg$1) {
      return this["byte2Byte(B)Ljava.lang.Byte;"](arg$1)
    });
    Class.prototype.short2Short = (function(arg$1) {
      return this["short2Short(S)Ljava.lang.Short;"](arg$1)
    });
    Class.prototype.char2Character = (function(arg$1) {
      return this["char2Character(C)Ljava.lang.Character;"](arg$1)
    });
    Class.prototype.int2Integer = (function(arg$1) {
      return this["int2Integer(I)Ljava.lang.Integer;"](arg$1)
    });
    Class.prototype.long2Long = (function(arg$1) {
      return this["long2Long(J)Ljava.lang.Long;"](arg$1)
    });
    Class.prototype.float2Float = (function(arg$1) {
      return this["float2Float(F)Ljava.lang.Float;"](arg$1)
    });
    Class.prototype.double2Double = (function(arg$1) {
      return this["double2Double(D)Ljava.lang.Double;"](arg$1)
    });
    Class.prototype.boolean2Boolean = (function(arg$1) {
      return this["boolean2Boolean(Z)Ljava.lang.Boolean;"](arg$1)
    });
    Class.prototype.byte2ByteConflict = (function(arg$1) {
      return this["byte2ByteConflict(B)O"](arg$1)
    });
    Class.prototype.short2ShortConflict = (function(arg$1) {
      return this["short2ShortConflict(S)O"](arg$1)
    });
    Class.prototype.char2CharacterConflict = (function(arg$1) {
      return this["char2CharacterConflict(C)O"](arg$1)
    });
    Class.prototype.int2IntegerConflict = (function(arg$1) {
      return this["int2IntegerConflict(I)O"](arg$1)
    });
    Class.prototype.long2LongConflict = (function(arg$1) {
      return this["long2LongConflict(J)O"](arg$1)
    });
    Class.prototype.float2FloatConflict = (function(arg$1) {
      return this["float2FloatConflict(F)O"](arg$1)
    });
    Class.prototype.double2DoubleConflict = (function(arg$1) {
      return this["double2DoubleConflict(D)O"](arg$1)
    });
    Class.prototype.boolean2BooleanConflict = (function(arg$1) {
      return this["boolean2BooleanConflict(Z)O"](arg$1)
    });
    Class.prototype.Byte2byte = (function(arg$1) {
      return this["Byte2byte(Ljava.lang.Byte;)B"](arg$1)
    });
    Class.prototype.Short2short = (function(arg$1) {
      return this["Short2short(Ljava.lang.Short;)S"](arg$1)
    });
    Class.prototype.Character2char = (function(arg$1) {
      return this["Character2char(Ljava.lang.Character;)C"](arg$1)
    });
    Class.prototype.Integer2int = (function(arg$1) {
      return this["Integer2int(Ljava.lang.Integer;)I"](arg$1)
    });
    Class.prototype.Long2long = (function(arg$1) {
      return this["Long2long(Ljava.lang.Long;)J"](arg$1)
    });
    Class.prototype.Float2float = (function(arg$1) {
      return this["Float2float(Ljava.lang.Float;)F"](arg$1)
    });
    Class.prototype.Double2double = (function(arg$1) {
      return this["Double2double(Ljava.lang.Double;)D"](arg$1)
    });
    Class.prototype.Boolean2boolean = (function(arg$1) {
      return this["Boolean2boolean(Ljava.lang.Boolean;)Z"](arg$1)
    });
    Class.prototype.any2stringfmt = (function(arg$1) {
      return this["any2stringfmt(O)O"](arg$1)
    });
    Class.prototype.augmentString = (function(arg$1) {
      return this["augmentString(T)T"](arg$1)
    });
    Class.prototype.any2stringadd = (function(arg$1) {
      return this["any2stringadd(O)O"](arg$1)
    });
    Class.prototype.unaugmentString = (function(arg$1) {
      return this["unaugmentString(T)T"](arg$1)
    });
    Class.prototype.stringCanBuildFrom = (function() {
      return this["stringCanBuildFrom()Lscala.collection.generic.CanBuildFrom;"]()
    });
    Class.prototype.StringCanBuildFrom = (function() {
      return this["StringCanBuildFrom()Lscala.collection.generic.CanBuildFrom;"]()
    });
    Class.prototype.conforms = (function() {
      return this["conforms()Lscala.Predef$<:<;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$", Class, JSClass, "scala.LowPriorityImplicits", {
      "scala.Predef$": true,
      "scala.LowPriorityImplicits": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef", "scala.Predef$");
  $.registerClass("scala.Predef$Ensuring", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$__resultOfEnsuring = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["__resultOfEnsuring()O"] = (function() {
      return this.$jsfield$__resultOfEnsuring
    });
    Class.prototype["x()O"] = (function() {
      return $.m["scala.Predef$Ensuring"]["x$extension(O)O"](this["__resultOfEnsuring()O"]())
    });
    Class.prototype["ensuring(Z)O"] = (function(arg$cond) {
      return $.m["scala.Predef$Ensuring"]["ensuring$extension0(OZ)O"](this["__resultOfEnsuring()O"](), arg$cond)
    });
    Class.prototype["ensuring(ZLscala.Function0;)O"] = (function(arg$cond, arg$msg) {
      return $.m["scala.Predef$Ensuring"]["ensuring$extension1(OZLscala.Function0;)O"](this["__resultOfEnsuring()O"](), arg$cond, arg$msg)
    });
    Class.prototype["ensuring(Lscala.Function1;)O"] = (function(arg$cond) {
      return $.m["scala.Predef$Ensuring"]["ensuring$extension2(OLscala.Function1;)O"](this["__resultOfEnsuring()O"](), arg$cond)
    });
    Class.prototype["ensuring(Lscala.Function1;Lscala.Function0;)O"] = (function(arg$cond, arg$msg) {
      return $.m["scala.Predef$Ensuring"]["ensuring$extension3(OLscala.Function1;Lscala.Function0;)O"](this["__resultOfEnsuring()O"](), arg$cond, arg$msg)
    });
    Class.prototype["hashCode()I"] = (function() {
      return $.m["scala.Predef$Ensuring"]["hashCode$extension(O)I"](this["__resultOfEnsuring()O"]())
    });
    Class.prototype["equals(O)Z"] = (function(arg$x$1) {
      return $.m["scala.Predef$Ensuring"]["equals$extension(OO)Z"](this["__resultOfEnsuring()O"](), arg$x$1)
    });
    Class.prototype["<init>(O)"] = (function(arg$__resultOfEnsuring) {
      this.$jsfield$__resultOfEnsuring = arg$__resultOfEnsuring;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.__resultOfEnsuring = (function() {
      return this["__resultOfEnsuring()O"]()
    });
    Class.prototype.x = (function() {
      return this["x()O"]()
    });
    Class.prototype.ensuring = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          if ((typeof(arg$1) === "boolean")) {
            return this["ensuring(Z)O"](arg$1)
          } else {
            if ($.isInstance(arg$1, "scala.Function1")) {
              return this["ensuring(Lscala.Function1;)O"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 2:
          if ((typeof(arg$1) === "boolean")) {
            return this["ensuring(ZLscala.Function0;)O"](arg$1, arg$2)
          } else {
            if ($.isInstance(arg$1, "scala.Function1")) {
              return this["ensuring(Lscala.Function1;Lscala.Function0;)O"](arg$1, arg$2)
            } else {
              throw "No matching overload"
            }
          };
        default:
          throw "No matching overload";
      }
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(O)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$Ensuring", Class, JSClass, "java.lang.Object", {
      "scala.Predef$Ensuring": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$Ensuring$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["x$extension(O)O"] = (function(arg$$this) {
      return arg$$this
    });
    Class.prototype["ensuring$extension0(OZ)O"] = (function(arg$$this, arg$cond) {
      $.m["scala.Predef"]["assert(Z)V"](arg$cond);
      return arg$$this
    });
    Class.prototype["ensuring$extension1(OZLscala.Function0;)O"] = (function(arg$$this, arg$cond, arg$msg) {
      $.m["scala.Predef"]["assert(ZLscala.Function0;)V"](arg$cond, arg$msg);
      return arg$$this
    });
    Class.prototype["ensuring$extension2(OLscala.Function1;)O"] = (function(arg$$this, arg$cond) {
      $.m["scala.Predef"]["assert(Z)V"]($.uZ(arg$cond["apply(O)O"](arg$$this)));
      return arg$$this
    });
    Class.prototype["ensuring$extension3(OLscala.Function1;Lscala.Function0;)O"] = (function(arg$$this, arg$cond, arg$msg) {
      $.m["scala.Predef"]["assert(ZLscala.Function0;)V"]($.uZ(arg$cond["apply(O)O"](arg$$this)), arg$msg);
      return arg$$this
    });
    Class.prototype["hashCode$extension(O)I"] = (function(arg$$this) {
      return $.objectHashCode(arg$$this)
    });
    Class.prototype["equals$extension(OO)Z"] = (function(arg$$this, arg$x$1) {
      {
        var x1$jsid$38229 = arg$x$1;
        var result$$jslabel$matchEnd4$38232;
        $jslabel$matchEnd4$38232: do {
          if ($.isInstance(x1$jsid$38229, "scala.Predef$Ensuring")) {
            result$$jslabel$matchEnd4$38232 = true;
            break $jslabel$matchEnd4$38232
          } else {
            /*<skip>*/
          };
          result$$jslabel$matchEnd4$38232 = false;
          break $jslabel$matchEnd4$38232
        } while (false);
        var jsx$4 = result$$jslabel$matchEnd4$38232
      };
      if (jsx$4) {
        if ((arg$x$1 === null)) {
          var Ensuring$1$jsid$24273 = null
        } else {
          var Ensuring$1$jsid$24273 = $.asInstance(arg$x$1, "scala.Predef$Ensuring")["__resultOfEnsuring()O"]()
        };
        return $.anyEqEq(arg$$this, Ensuring$1$jsid$24273)
      } else {
        return false
      }
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.Predef$Ensuring"]._instance = this;
      return this
    });
    Class.prototype.x$extension = (function(arg$1) {
      return this["x$extension(O)O"](arg$1)
    });
    Class.prototype.ensuring$extension0 = (function(arg$1, arg$2) {
      return this["ensuring$extension0(OZ)O"](arg$1, arg$2)
    });
    Class.prototype.ensuring$extension1 = (function(arg$1, arg$2, arg$3) {
      return this["ensuring$extension1(OZLscala.Function0;)O"](arg$1, arg$2, arg$3)
    });
    Class.prototype.ensuring$extension2 = (function(arg$1, arg$2) {
      return this["ensuring$extension2(OLscala.Function1;)O"](arg$1, arg$2)
    });
    Class.prototype.ensuring$extension3 = (function(arg$1, arg$2, arg$3) {
      return this["ensuring$extension3(OLscala.Function1;Lscala.Function0;)O"](arg$1, arg$2, arg$3)
    });
    Class.prototype.hashCode$extension = (function(arg$1) {
      return this["hashCode$extension(O)I"](arg$1)
    });
    Class.prototype.equals$extension = (function(arg$1, arg$2) {
      return this["equals$extension(OO)Z"](arg$1, arg$2)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$Ensuring$", Class, JSClass, "java.lang.Object", {
      "scala.Predef$Ensuring$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef$Ensuring", "scala.Predef$Ensuring$");
  $.registerClass("scala.Predef$Pair$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(OO)Lscala.Tuple2;"] = (function(arg$x, arg$y) {
      return new $.c["scala.Tuple2"]()["<init>(OO)"](arg$x, arg$y)
    });
    Class.prototype["unapply(Lscala.Tuple2;)Lscala.Option;"] = (function(arg$x) {
      return new $.c["scala.Some"]()["<init>(O)"](arg$x)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1, arg$2) {
      return this["apply(OO)Lscala.Tuple2;"](arg$1, arg$2)
    });
    Class.prototype.unapply = (function(arg$1) {
      return this["unapply(Lscala.Tuple2;)Lscala.Option;"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$Pair$", Class, JSClass, "java.lang.Object", {
      "scala.Predef$Pair$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef$Pair", "scala.Predef$Pair$");
  $.registerClass("scala.Predef$Triple$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(OOO)Lscala.Tuple3;"] = (function(arg$x, arg$y, arg$z) {
      return new $.c["scala.Tuple3"]()["<init>(OOO)"](arg$x, arg$y, arg$z)
    });
    Class.prototype["unapply(Lscala.Tuple3;)Lscala.Option;"] = (function(arg$x) {
      return new $.c["scala.Some"]()["<init>(O)"](arg$x)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1, arg$2, arg$3) {
      return this["apply(OOO)Lscala.Tuple3;"](arg$1, arg$2, arg$3)
    });
    Class.prototype.unapply = (function(arg$1) {
      return this["unapply(Lscala.Tuple3;)Lscala.Option;"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$Triple$", Class, JSClass, "java.lang.Object", {
      "scala.Predef$Triple$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef$Triple", "scala.Predef$Triple$");
  $.registerClass("scala.Predef$ArrowAssoc", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$__leftOfArrow = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["__leftOfArrow()O"] = (function() {
      return this.$jsfield$__leftOfArrow
    });
    Class.prototype["x()O"] = (function() {
      return $.m["scala.Predef$ArrowAssoc"]["x$extension(O)O"](this["__leftOfArrow()O"]())
    });
    Class.prototype["->(O)Lscala.Tuple2;"] = (function(arg$y) {
      return $.m["scala.Predef$ArrowAssoc"]["->$extension(OO)Lscala.Tuple2;"](this["__leftOfArrow()O"](), arg$y)
    });
    Class.prototype["\u2192(O)Lscala.Tuple2;"] = (function(arg$y) {
      return $.m["scala.Predef$ArrowAssoc"]["\u2192$extension(OO)Lscala.Tuple2;"](this["__leftOfArrow()O"](), arg$y)
    });
    Class.prototype["hashCode()I"] = (function() {
      return $.m["scala.Predef$ArrowAssoc"]["hashCode$extension(O)I"](this["__leftOfArrow()O"]())
    });
    Class.prototype["equals(O)Z"] = (function(arg$x$1) {
      return $.m["scala.Predef$ArrowAssoc"]["equals$extension(OO)Z"](this["__leftOfArrow()O"](), arg$x$1)
    });
    Class.prototype["<init>(O)"] = (function(arg$__leftOfArrow) {
      this.$jsfield$__leftOfArrow = arg$__leftOfArrow;
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.__leftOfArrow = (function() {
      return this["__leftOfArrow()O"]()
    });
    Class.prototype.x = (function() {
      return this["x()O"]()
    });
    Class.prototype["->"] = (function(arg$1) {
      return this["->(O)Lscala.Tuple2;"](arg$1)
    });
    Class.prototype["\u2192"] = (function(arg$1) {
      return this["\u2192(O)Lscala.Tuple2;"](arg$1)
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(O)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$ArrowAssoc", Class, JSClass, "java.lang.Object", {
      "scala.Predef$ArrowAssoc": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$ArrowAssoc$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["x$extension(O)O"] = (function(arg$$this) {
      return arg$$this
    });
    Class.prototype["->$extension(OO)Lscala.Tuple2;"] = (function(arg$$this, arg$y) {
      return new $.c["scala.Tuple2"]()["<init>(OO)"](arg$$this, arg$y)
    });
    Class.prototype["\u2192$extension(OO)Lscala.Tuple2;"] = (function(arg$$this, arg$y) {
      return this["->$extension(OO)Lscala.Tuple2;"](arg$$this, arg$y)
    });
    Class.prototype["hashCode$extension(O)I"] = (function(arg$$this) {
      return $.objectHashCode(arg$$this)
    });
    Class.prototype["equals$extension(OO)Z"] = (function(arg$$this, arg$x$1) {
      {
        var x1$jsid$38237 = arg$x$1;
        var result$$jslabel$matchEnd4$38240;
        $jslabel$matchEnd4$38240: do {
          if ($.isInstance(x1$jsid$38237, "scala.Predef$ArrowAssoc")) {
            result$$jslabel$matchEnd4$38240 = true;
            break $jslabel$matchEnd4$38240
          } else {
            /*<skip>*/
          };
          result$$jslabel$matchEnd4$38240 = false;
          break $jslabel$matchEnd4$38240
        } while (false);
        var jsx$5 = result$$jslabel$matchEnd4$38240
      };
      if (jsx$5) {
        if ((arg$x$1 === null)) {
          var ArrowAssoc$1$jsid$24550 = null
        } else {
          var ArrowAssoc$1$jsid$24550 = $.asInstance(arg$x$1, "scala.Predef$ArrowAssoc")["__leftOfArrow()O"]()
        };
        return $.anyEqEq(arg$$this, ArrowAssoc$1$jsid$24550)
      } else {
        return false
      }
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.Predef$ArrowAssoc"]._instance = this;
      return this
    });
    Class.prototype.x$extension = (function(arg$1) {
      return this["x$extension(O)O"](arg$1)
    });
    Class.prototype["->$extension"] = (function(arg$1, arg$2) {
      return this["->$extension(OO)Lscala.Tuple2;"](arg$1, arg$2)
    });
    Class.prototype["\u2192$extension"] = (function(arg$1, arg$2) {
      return this["\u2192$extension(OO)Lscala.Tuple2;"](arg$1, arg$2)
    });
    Class.prototype.hashCode$extension = (function(arg$1) {
      return this["hashCode$extension(O)I"](arg$1)
    });
    Class.prototype.equals$extension = (function(arg$1, arg$2) {
      return this["equals$extension(OO)Z"](arg$1, arg$2)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$ArrowAssoc$", Class, JSClass, "java.lang.Object", {
      "scala.Predef$ArrowAssoc$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef$ArrowAssoc", "scala.Predef$ArrowAssoc$");
  $.registerClass("scala.Predef$<:<", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply$mcZD$sp(D)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZD$sp(Lscala.Function1;D)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDD$sp(D)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDD$sp(Lscala.Function1;D)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFD$sp(D)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFD$sp(Lscala.Function1;D)F"](this, arg$v1)
    });
    Class.prototype["apply$mcID$sp(D)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcID$sp(Lscala.Function1;D)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJD$sp(D)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJD$sp(Lscala.Function1;D)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVD$sp(D)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVD$sp(Lscala.Function1;D)V"](this, arg$v1)
    });
    Class.prototype["apply$mcZF$sp(F)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZF$sp(Lscala.Function1;F)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDF$sp(F)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDF$sp(Lscala.Function1;F)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFF$sp(F)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFF$sp(Lscala.Function1;F)F"](this, arg$v1)
    });
    Class.prototype["apply$mcIF$sp(F)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcIF$sp(Lscala.Function1;F)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJF$sp(F)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJF$sp(Lscala.Function1;F)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVF$sp(F)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVF$sp(Lscala.Function1;F)V"](this, arg$v1)
    });
    Class.prototype["apply$mcZI$sp(I)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZI$sp(Lscala.Function1;I)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDI$sp(I)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDI$sp(Lscala.Function1;I)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFI$sp(I)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFI$sp(Lscala.Function1;I)F"](this, arg$v1)
    });
    Class.prototype["apply$mcII$sp(I)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcII$sp(Lscala.Function1;I)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJI$sp(I)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJI$sp(Lscala.Function1;I)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVI$sp(I)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVI$sp(Lscala.Function1;I)V"](this, arg$v1)
    });
    Class.prototype["apply$mcZJ$sp(J)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZJ$sp(Lscala.Function1;J)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDJ$sp(J)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDJ$sp(Lscala.Function1;J)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFJ$sp(J)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFJ$sp(Lscala.Function1;J)F"](this, arg$v1)
    });
    Class.prototype["apply$mcIJ$sp(J)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcIJ$sp(Lscala.Function1;J)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJJ$sp(J)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJJ$sp(Lscala.Function1;J)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVJ$sp(J)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVJ$sp(Lscala.Function1;J)V"](this, arg$v1)
    });
    Class.prototype["compose(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcID$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcID$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcIF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcIF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcII$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcII$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcIJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcIJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcID$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcID$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcIF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcIF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcII$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcII$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcIJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcIJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["toString()T"] = (function() {
      return $.m["scala.Function1$class"]["toString(Lscala.Function1;)T"](this)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.m["scala.Function1$class"]["$init$(Lscala.Function1;)V"](this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$<:<", Class, JSClass, "java.lang.Object", {
      "scala.Predef$<:<": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$=:=", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply$mcZD$sp(D)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZD$sp(Lscala.Function1;D)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDD$sp(D)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDD$sp(Lscala.Function1;D)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFD$sp(D)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFD$sp(Lscala.Function1;D)F"](this, arg$v1)
    });
    Class.prototype["apply$mcID$sp(D)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcID$sp(Lscala.Function1;D)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJD$sp(D)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJD$sp(Lscala.Function1;D)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVD$sp(D)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVD$sp(Lscala.Function1;D)V"](this, arg$v1)
    });
    Class.prototype["apply$mcZF$sp(F)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZF$sp(Lscala.Function1;F)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDF$sp(F)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDF$sp(Lscala.Function1;F)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFF$sp(F)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFF$sp(Lscala.Function1;F)F"](this, arg$v1)
    });
    Class.prototype["apply$mcIF$sp(F)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcIF$sp(Lscala.Function1;F)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJF$sp(F)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJF$sp(Lscala.Function1;F)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVF$sp(F)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVF$sp(Lscala.Function1;F)V"](this, arg$v1)
    });
    Class.prototype["apply$mcZI$sp(I)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZI$sp(Lscala.Function1;I)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDI$sp(I)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDI$sp(Lscala.Function1;I)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFI$sp(I)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFI$sp(Lscala.Function1;I)F"](this, arg$v1)
    });
    Class.prototype["apply$mcII$sp(I)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcII$sp(Lscala.Function1;I)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJI$sp(I)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJI$sp(Lscala.Function1;I)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVI$sp(I)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVI$sp(Lscala.Function1;I)V"](this, arg$v1)
    });
    Class.prototype["apply$mcZJ$sp(J)Z"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcZJ$sp(Lscala.Function1;J)Z"](this, arg$v1)
    });
    Class.prototype["apply$mcDJ$sp(J)D"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcDJ$sp(Lscala.Function1;J)D"](this, arg$v1)
    });
    Class.prototype["apply$mcFJ$sp(J)F"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcFJ$sp(Lscala.Function1;J)F"](this, arg$v1)
    });
    Class.prototype["apply$mcIJ$sp(J)I"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcIJ$sp(Lscala.Function1;J)I"](this, arg$v1)
    });
    Class.prototype["apply$mcJJ$sp(J)J"] = (function(arg$v1) {
      return $.m["scala.Function1$class"]["apply$mcJJ$sp(Lscala.Function1;J)J"](this, arg$v1)
    });
    Class.prototype["apply$mcVJ$sp(J)V"] = (function(arg$v1) {
      $.m["scala.Function1$class"]["apply$mcVJ$sp(Lscala.Function1;J)V"](this, arg$v1)
    });
    Class.prototype["compose(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcID$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcID$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcIF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcIF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcII$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcII$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcZJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcZJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcDJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcDJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcFJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcFJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcIJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcIJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcJJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcJJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["compose$mcVJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["compose$mcVJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcID$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcID$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVD$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVD$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcIF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcIF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVF$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVF$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcII$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcII$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVI$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVI$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcZJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcZJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcDJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcDJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcFJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcFJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcIJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcIJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcJJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcJJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["andThen$mcVJ$sp(Lscala.Function1;)Lscala.Function1;"] = (function(arg$g) {
      return $.m["scala.Function1$class"]["andThen$mcVJ$sp(Lscala.Function1;Lscala.Function1;)Lscala.Function1;"](this, arg$g)
    });
    Class.prototype["toString()T"] = (function() {
      return $.m["scala.Function1$class"]["toString(Lscala.Function1;)T"](this)
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.m["scala.Function1$class"]["$init$(Lscala.Function1;)V"](this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$=:=", Class, JSClass, "java.lang.Object", {
      "scala.Predef$=:=": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$=:=$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["tpEquals()Lscala.Predef$=:=;"] = (function() {
      return $.m["scala.Predef"].$jsfield$scala$Predef$$singleton_$eq$colon$eq
    });
    Class.prototype["readResolve()O"] = (function() {
      return $.m["scala.Predef$=:="]
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.Predef$=:="]._instance = this;
      return this
    });
    Class.prototype.tpEquals = (function() {
      return this["tpEquals()Lscala.Predef$=:=;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$=:=$", Class, JSClass, "java.lang.Object", {
      "scala.Predef$=:=$": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef$=:=", "scala.Predef$=:=$");
  $.registerClass("scala.Predef$DummyImplicit", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$DummyImplicit", Class, JSClass, "java.lang.Object", {
      "scala.Predef$DummyImplicit": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$DummyImplicit$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["dummyImplicit()Lscala.Predef$DummyImplicit;"] = (function() {
      return new $.c["scala.Predef$DummyImplicit"]()["<init>()"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.Predef$DummyImplicit"]._instance = this;
      return this
    });
    Class.prototype.dummyImplicit = (function() {
      return this["dummyImplicit()Lscala.Predef$DummyImplicit;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$DummyImplicit$", Class, JSClass, "java.lang.Object", {
      "scala.Predef$DummyImplicit$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Predef$DummyImplicit", "scala.Predef$DummyImplicit$");
  $.registerClass("scala.Predef$$anon$3", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(T)Lscala.collection.mutable.StringBuilder;"] = (function(arg$from) {
      return this["apply()Lscala.collection.mutable.StringBuilder;"]()
    });
    Class.prototype["apply()Lscala.collection.mutable.StringBuilder;"] = (function() {
      return $.m["scala.collection.mutable.StringBuilder"]["newBuilder()Lscala.collection.mutable.StringBuilder;"]()
    });
    Class.prototype["apply()Lscala.collection.mutable.Builder;"] = (function() {
      return this["apply()Lscala.collection.mutable.StringBuilder;"]()
    });
    Class.prototype["apply(O)Lscala.collection.mutable.Builder;"] = (function(arg$from) {
      return this["apply(T)Lscala.collection.mutable.StringBuilder;"]($.asInstanceString(arg$from))
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["apply()Lscala.collection.mutable.StringBuilder;"]();
        case 1:
          if ((typeof(arg$1) === "string")) {
            return this["apply(T)Lscala.collection.mutable.StringBuilder;"](arg$1)
          } else {
            if ($.isInstance(arg$1, "java.lang.Object")) {
              return this["apply(O)Lscala.collection.mutable.Builder;"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        default:
          throw "No matching overload";
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$$anon$3", Class, JSClass, "java.lang.Object", {
      "scala.Predef$$anon$3": true,
      "scala.collection.generic.CanBuildFrom": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$$anon$1", (function($) {
    function Class() {
      $.c["scala.Predef$<:<"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["scala.Predef$<:<"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["<init>()"] = (function() {
      $.c["scala.Predef$<:<"].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$$anon$1", Class, JSClass, "scala.Predef$<:<", {
      "scala.Predef$$anon$1": true,
      "scala.Predef$<:<": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.Predef$$anon$2", (function($) {
    function Class() {
      $.c["scala.Predef$=:="].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["scala.Predef$=:="].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(O)O"] = (function(arg$x) {
      return arg$x
    });
    Class.prototype["<init>()"] = (function() {
      $.c["scala.Predef$=:="].prototype["<init>()"].call(this);
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Predef$$anon$2", Class, JSClass, "scala.Predef$=:=", {
      "scala.Predef$$anon$2": true,
      "scala.Predef$=:=": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.Console$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$BLACK = null;
      this.$jsfield$RED = null;
      this.$jsfield$GREEN = null;
      this.$jsfield$YELLOW = null;
      this.$jsfield$BLUE = null;
      this.$jsfield$MAGENTA = null;
      this.$jsfield$CYAN = null;
      this.$jsfield$WHITE = null;
      this.$jsfield$BLACK_B = null;
      this.$jsfield$RED_B = null;
      this.$jsfield$GREEN_B = null;
      this.$jsfield$YELLOW_B = null;
      this.$jsfield$BLUE_B = null;
      this.$jsfield$MAGENTA_B = null;
      this.$jsfield$CYAN_B = null;
      this.$jsfield$WHITE_B = null;
      this.$jsfield$RESET = null;
      this.$jsfield$BOLD = null;
      this.$jsfield$UNDERLINED = null;
      this.$jsfield$BLINK = null;
      this.$jsfield$REVERSED = null;
      this.$jsfield$INVISIBLE = null;
      this.$jsfield$outVar = null;
      this.$jsfield$errVar = null;
      this.$jsfield$inVar = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["BLACK()T"] = (function() {
      return "\u001b[30m"
    });
    Class.prototype["RED()T"] = (function() {
      return "\u001b[31m"
    });
    Class.prototype["GREEN()T"] = (function() {
      return "\u001b[32m"
    });
    Class.prototype["YELLOW()T"] = (function() {
      return "\u001b[33m"
    });
    Class.prototype["BLUE()T"] = (function() {
      return "\u001b[34m"
    });
    Class.prototype["MAGENTA()T"] = (function() {
      return "\u001b[35m"
    });
    Class.prototype["CYAN()T"] = (function() {
      return "\u001b[36m"
    });
    Class.prototype["WHITE()T"] = (function() {
      return "\u001b[37m"
    });
    Class.prototype["BLACK_B()T"] = (function() {
      return "\u001b[40m"
    });
    Class.prototype["RED_B()T"] = (function() {
      return "\u001b[41m"
    });
    Class.prototype["GREEN_B()T"] = (function() {
      return "\u001b[42m"
    });
    Class.prototype["YELLOW_B()T"] = (function() {
      return "\u001b[43m"
    });
    Class.prototype["BLUE_B()T"] = (function() {
      return "\u001b[44m"
    });
    Class.prototype["MAGENTA_B()T"] = (function() {
      return "\u001b[45m"
    });
    Class.prototype["CYAN_B()T"] = (function() {
      return "\u001b[46m"
    });
    Class.prototype["WHITE_B()T"] = (function() {
      return "\u001b[47m"
    });
    Class.prototype["RESET()T"] = (function() {
      return "\u001b[0m"
    });
    Class.prototype["BOLD()T"] = (function() {
      return "\u001b[1m"
    });
    Class.prototype["UNDERLINED()T"] = (function() {
      return "\u001b[4m"
    });
    Class.prototype["BLINK()T"] = (function() {
      return "\u001b[5m"
    });
    Class.prototype["REVERSED()T"] = (function() {
      return "\u001b[7m"
    });
    Class.prototype["INVISIBLE()T"] = (function() {
      return "\u001b[8m"
    });
    Class.prototype["outVar()Lscala.util.DynamicVariable;"] = (function() {
      return this.$jsfield$outVar
    });
    Class.prototype["errVar()Lscala.util.DynamicVariable;"] = (function() {
      return this.$jsfield$errVar
    });
    Class.prototype["inVar()Lscala.util.DynamicVariable;"] = (function() {
      return this.$jsfield$inVar
    });
    Class.prototype["out()Ljava.io.PrintStream;"] = (function() {
      return $.asInstance(this["outVar()Lscala.util.DynamicVariable;"]()["value()O"](), "java.io.PrintStream")
    });
    Class.prototype["err()Ljava.io.PrintStream;"] = (function() {
      return $.asInstance(this["errVar()Lscala.util.DynamicVariable;"]()["value()O"](), "java.io.PrintStream")
    });
    Class.prototype["in()Ljava.io.BufferedReader;"] = (function() {
      return $.asInstance(this["inVar()Lscala.util.DynamicVariable;"]()["value()O"](), "java.io.BufferedReader")
    });
    Class.prototype["setOut(Ljava.io.PrintStream;)V"] = (function(arg$out) {
      this["outVar()Lscala.util.DynamicVariable;"]()["value_=(O)V"](arg$out)
    });
    Class.prototype["withOut(Ljava.io.PrintStream;Lscala.Function0;)O"] = (function(arg$out, arg$thunk) {
      return this["outVar()Lscala.util.DynamicVariable;"]()["withValue(OLscala.Function0;)O"](arg$out, arg$thunk)
    });
    Class.prototype["setOut(Ljava.io.OutputStream;)V"] = (function(arg$out) {
      this["setOut(Ljava.io.PrintStream;)V"](new $.c["java.io.PrintStream"]()["<init>(Ljava.io.OutputStream;)"](arg$out))
    });
    Class.prototype["withOut(Ljava.io.OutputStream;Lscala.Function0;)O"] = (function(arg$out, arg$thunk) {
      return this["withOut(Ljava.io.PrintStream;Lscala.Function0;)O"](new $.c["java.io.PrintStream"]()["<init>(Ljava.io.OutputStream;)"](arg$out), arg$thunk)
    });
    Class.prototype["setErr(Ljava.io.PrintStream;)V"] = (function(arg$err) {
      this["errVar()Lscala.util.DynamicVariable;"]()["value_=(O)V"](arg$err)
    });
    Class.prototype["withErr(Ljava.io.PrintStream;Lscala.Function0;)O"] = (function(arg$err, arg$thunk) {
      return this["errVar()Lscala.util.DynamicVariable;"]()["withValue(OLscala.Function0;)O"](arg$err, arg$thunk)
    });
    Class.prototype["setErr(Ljava.io.OutputStream;)V"] = (function(arg$err) {
      this["setErr(Ljava.io.PrintStream;)V"](new $.c["java.io.PrintStream"]()["<init>(Ljava.io.OutputStream;)"](arg$err))
    });
    Class.prototype["withErr(Ljava.io.OutputStream;Lscala.Function0;)O"] = (function(arg$err, arg$thunk) {
      return this["withErr(Ljava.io.PrintStream;Lscala.Function0;)O"](new $.c["java.io.PrintStream"]()["<init>(Ljava.io.OutputStream;)"](arg$err), arg$thunk)
    });
    Class.prototype["setIn(Ljava.io.Reader;)V"] = (function(arg$reader) {
      this["inVar()Lscala.util.DynamicVariable;"]()["value_=(O)V"](new $.c["java.io.BufferedReader"]()["<init>(Ljava.io.Reader;)"](arg$reader))
    });
    Class.prototype["withIn(Ljava.io.Reader;Lscala.Function0;)O"] = (function(arg$reader, arg$thunk) {
      return this["inVar()Lscala.util.DynamicVariable;"]()["withValue(OLscala.Function0;)O"](new $.c["java.io.BufferedReader"]()["<init>(Ljava.io.Reader;)"](arg$reader), arg$thunk)
    });
    Class.prototype["setIn(Ljava.io.InputStream;)V"] = (function(arg$in) {
      this["setIn(Ljava.io.Reader;)V"](new $.c["java.io.InputStreamReader"]()["<init>(Ljava.io.InputStream;)"](arg$in))
    });
    Class.prototype["withIn(Ljava.io.InputStream;Lscala.Function0;)O"] = (function(arg$in, arg$thunk) {
      return this["withIn(Ljava.io.Reader;Lscala.Function0;)O"](new $.c["java.io.InputStreamReader"]()["<init>(Ljava.io.InputStream;)"](arg$in), arg$thunk)
    });
    Class.prototype["print(O)V"] = (function(arg$obj) {
      var jsx$1 = this["out()Ljava.io.PrintStream;"]();
      if ((null === arg$obj)) {
        var jsx$2 = "null"
      } else {
        var jsx$2 = arg$obj.toString()
      };
      jsx$1["print(T)V"](jsx$2)
    });
    Class.prototype["flush()V"] = (function() {
      this["out()Ljava.io.PrintStream;"]()["flush()V"]()
    });
    Class.prototype["println()V"] = (function() {
      this["out()Ljava.io.PrintStream;"]()["println()V"]()
    });
    Class.prototype["println(O)V"] = (function(arg$x) {
      this["out()Ljava.io.PrintStream;"]()["println(O)V"](arg$x)
    });
    Class.prototype["printf(TLscala.collection.Seq;)V"] = (function(arg$text, arg$args) {
      this["out()Ljava.io.PrintStream;"]()["print(T)V"](new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](arg$text))["format(Lscala.collection.Seq;)T"](arg$args))
    });
    Class.prototype["readLine()T"] = (function() {
      return this["in()Ljava.io.BufferedReader;"]()["readLine()T"]()
    });
    Class.prototype["readLine(TLscala.collection.Seq;)T"] = (function(arg$text, arg$args) {
      this["printf(TLscala.collection.Seq;)V"](arg$text, arg$args);
      return this["readLine()T"]()
    });
    Class.prototype["readBoolean()Z"] = (function() {
      var s$jsid$33659 = this["readLine()T"]();
      if ((s$jsid$33659 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        var x1$jsid$38306 = s$jsid$33659.toLowerCase();
        var result$$jslabel$matchEnd7$38320;
        $jslabel$matchEnd7$38320: do {
          if (("true" === x1$jsid$38306)) {
            result$$jslabel$matchEnd7$38320 = true;
            break $jslabel$matchEnd7$38320
          } else {
            /*<skip>*/
          };
          if (("t" === x1$jsid$38306)) {
            result$$jslabel$matchEnd7$38320 = true;
            break $jslabel$matchEnd7$38320
          } else {
            /*<skip>*/
          };
          if (("yes" === x1$jsid$38306)) {
            result$$jslabel$matchEnd7$38320 = true;
            break $jslabel$matchEnd7$38320
          } else {
            /*<skip>*/
          };
          if (("y" === x1$jsid$38306)) {
            result$$jslabel$matchEnd7$38320 = true;
            break $jslabel$matchEnd7$38320
          } else {
            /*<skip>*/
          };
          result$$jslabel$matchEnd7$38320 = false;
          break $jslabel$matchEnd7$38320
        } while (false);
        return result$$jslabel$matchEnd7$38320
      }
    });
    Class.prototype["readByte()B"] = (function() {
      var s$jsid$33931 = this["readLine()T"]();
      if ((s$jsid$33931 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](s$jsid$33931))["toByte()B"]()
      }
    });
    Class.prototype["readShort()S"] = (function() {
      var s$jsid$33947 = this["readLine()T"]();
      if ((s$jsid$33947 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](s$jsid$33947))["toShort()S"]()
      }
    });
    Class.prototype["readChar()C"] = (function() {
      var s$jsid$33963 = this["readLine()T"]();
      if ((s$jsid$33963 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return s$jsid$33963.charCodeAt(0)
      }
    });
    Class.prototype["readInt()I"] = (function() {
      var s$jsid$33974 = this["readLine()T"]();
      if ((s$jsid$33974 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](s$jsid$33974))["toInt()I"]()
      }
    });
    Class.prototype["readLong()J"] = (function() {
      var s$jsid$33990 = this["readLine()T"]();
      if ((s$jsid$33990 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](s$jsid$33990))["toLong()J"]()
      }
    });
    Class.prototype["readFloat()F"] = (function() {
      var s$jsid$34006 = this["readLine()T"]();
      if ((s$jsid$34006 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](s$jsid$34006))["toFloat()F"]()
      }
    });
    Class.prototype["readDouble()D"] = (function() {
      var s$jsid$34022 = this["readLine()T"]();
      if ((s$jsid$34022 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return new $.c["scala.collection.immutable.StringOps"]()["<init>(T)"]($.m["scala.Predef"]["augmentString(T)T"](s$jsid$34022))["toDouble()D"]()
      }
    });
    Class.prototype["readf(T)Lscala.collection.immutable.List;"] = (function(arg$format) {
      var s$jsid$34038 = this["readLine()T"]();
      if ((s$jsid$34038 === null)) {
        throw new $.c["java.io.EOFException"]()["<init>(T)"]("Console has reached end of input")
      } else {
        return this["textComponents([O)Lscala.collection.immutable.List;"](new $.c["java.text.MessageFormat"]()["<init>(T)"](arg$format)["parse(T)[O"](s$jsid$34038))
      }
    });
    Class.prototype["readf1(T)O"] = (function(arg$format) {
      return this["readf(T)Lscala.collection.immutable.List;"](arg$format)["head()O"]()
    });
    Class.prototype["readf2(T)Lscala.Tuple2;"] = (function(arg$format) {
      var res$jsid$34418 = this["readf(T)Lscala.collection.immutable.List;"](arg$format);
      return new $.c["scala.Tuple2"]()["<init>(OO)"](res$jsid$34418["head()O"](), $.asInstance(res$jsid$34418["tail()O"](), "scala.collection.IterableLike")["head()O"]())
    });
    Class.prototype["readf3(T)Lscala.Tuple3;"] = (function(arg$format) {
      var res$jsid$34437 = this["readf(T)Lscala.collection.immutable.List;"](arg$format);
      return new $.c["scala.Tuple3"]()["<init>(OOO)"](res$jsid$34437["head()O"](), $.asInstance(res$jsid$34437["tail()O"](), "scala.collection.IterableLike")["head()O"](), $.asInstance($.asInstance(res$jsid$34437["tail()O"](), "scala.collection.TraversableLike")["tail()O"](), "scala.collection.IterableLike")["head()O"]())
    });
    Class.prototype["textComponents([O)Lscala.collection.immutable.List;"] = (function(arg$a) {
      var i$jsid$34450 = (arg$a.underlying.length - 1);
      var res$jsid$34451 = $.m["scala.collection.immutable.Nil"];
      while ((i$jsid$34450 >= 0)) {
        var x1$jsid$38340 = arg$a.underlying[i$jsid$34450];
        var result$$jslabel$matchEnd11$38350;
        $jslabel$matchEnd11$38350: do {
          if ($.isInstance(x1$jsid$38340, "java.lang.Boolean")) {
            var x2$jsid$38341 = $.asInstance(x1$jsid$38340, "java.lang.Boolean");
            result$$jslabel$matchEnd11$38350 = $.bZ(x2$jsid$38341["booleanValue()Z"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Byte")) {
            var x3$jsid$38342 = $.asInstance(x1$jsid$38340, "java.lang.Byte");
            result$$jslabel$matchEnd11$38350 = $.bB(x3$jsid$38342["byteValue()B"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Short")) {
            var x4$jsid$38343 = $.asInstance(x1$jsid$38340, "java.lang.Short");
            result$$jslabel$matchEnd11$38350 = $.bS(x4$jsid$38343["shortValue()S"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Character")) {
            var x5$jsid$38344 = $.asInstance(x1$jsid$38340, "java.lang.Character");
            result$$jslabel$matchEnd11$38350 = $.bC(x5$jsid$38344["charValue()C"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Integer")) {
            var x6$jsid$38345 = $.asInstance(x1$jsid$38340, "java.lang.Integer");
            result$$jslabel$matchEnd11$38350 = $.bI(x6$jsid$38345["intValue()I"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Long")) {
            var x7$jsid$38346 = $.asInstance(x1$jsid$38340, "java.lang.Long");
            result$$jslabel$matchEnd11$38350 = $.bJ(x7$jsid$38346["longValue()J"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Float")) {
            var x8$jsid$38347 = $.asInstance(x1$jsid$38340, "java.lang.Float");
            result$$jslabel$matchEnd11$38350 = $.bF(x8$jsid$38347["floatValue()F"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          if ($.isInstance(x1$jsid$38340, "java.lang.Double")) {
            var x9$jsid$38348 = $.asInstance(x1$jsid$38340, "java.lang.Double");
            result$$jslabel$matchEnd11$38350 = $.bD(x9$jsid$38348["doubleValue()D"]());
            break $jslabel$matchEnd11$38350
          } else {
            /*<skip>*/
          };
          result$$jslabel$matchEnd11$38350 = x1$jsid$38340;
          break $jslabel$matchEnd11$38350
        } while (false);
        var x$1$jsid$34586 = result$$jslabel$matchEnd11$38350;
        res$jsid$34451 = res$jsid$34451["::(O)Lscala.collection.immutable.List;"](x$1$jsid$34586);
        i$jsid$34450 = (i$jsid$34450 - 1)
      };
      return res$jsid$34451
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.Console"]._instance = this;
      this.$jsfield$outVar = new $.c["scala.util.DynamicVariable"]()["<init>(O)"]($.m["java.lang.System"]["out()Ljava.io.PrintStream;"]());
      this.$jsfield$errVar = new $.c["scala.util.DynamicVariable"]()["<init>(O)"]($.m["java.lang.System"]["err()Ljava.io.PrintStream;"]());
      this.$jsfield$inVar = new $.c["scala.util.DynamicVariable"]()["<init>(O)"](null);
      return this
    });
    Class.prototype.BLACK = (function() {
      return this["BLACK()T"]()
    });
    Class.prototype.RED = (function() {
      return this["RED()T"]()
    });
    Class.prototype.GREEN = (function() {
      return this["GREEN()T"]()
    });
    Class.prototype.YELLOW = (function() {
      return this["YELLOW()T"]()
    });
    Class.prototype.BLUE = (function() {
      return this["BLUE()T"]()
    });
    Class.prototype.MAGENTA = (function() {
      return this["MAGENTA()T"]()
    });
    Class.prototype.CYAN = (function() {
      return this["CYAN()T"]()
    });
    Class.prototype.WHITE = (function() {
      return this["WHITE()T"]()
    });
    Class.prototype.BLACK_B = (function() {
      return this["BLACK_B()T"]()
    });
    Class.prototype.RED_B = (function() {
      return this["RED_B()T"]()
    });
    Class.prototype.GREEN_B = (function() {
      return this["GREEN_B()T"]()
    });
    Class.prototype.YELLOW_B = (function() {
      return this["YELLOW_B()T"]()
    });
    Class.prototype.BLUE_B = (function() {
      return this["BLUE_B()T"]()
    });
    Class.prototype.MAGENTA_B = (function() {
      return this["MAGENTA_B()T"]()
    });
    Class.prototype.CYAN_B = (function() {
      return this["CYAN_B()T"]()
    });
    Class.prototype.WHITE_B = (function() {
      return this["WHITE_B()T"]()
    });
    Class.prototype.RESET = (function() {
      return this["RESET()T"]()
    });
    Class.prototype.BOLD = (function() {
      return this["BOLD()T"]()
    });
    Class.prototype.UNDERLINED = (function() {
      return this["UNDERLINED()T"]()
    });
    Class.prototype.BLINK = (function() {
      return this["BLINK()T"]()
    });
    Class.prototype.REVERSED = (function() {
      return this["REVERSED()T"]()
    });
    Class.prototype.INVISIBLE = (function() {
      return this["INVISIBLE()T"]()
    });
    Class.prototype.out = (function() {
      return this["out()Ljava.io.PrintStream;"]()
    });
    Class.prototype.err = (function() {
      return this["err()Ljava.io.PrintStream;"]()
    });
    Class.prototype["in"] = (function() {
      return this["in()Ljava.io.BufferedReader;"]()
    });
    Class.prototype.setOut = (function(arg$1) {
      if ($.isInstance(arg$1, "java.io.PrintStream")) {
        return this["setOut(Ljava.io.PrintStream;)V"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.io.OutputStream")) {
          return this["setOut(Ljava.io.OutputStream;)V"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.withOut = (function(arg$1, arg$2) {
      if ($.isInstance(arg$1, "java.io.PrintStream")) {
        return this["withOut(Ljava.io.PrintStream;Lscala.Function0;)O"](arg$1, arg$2)
      } else {
        if ($.isInstance(arg$1, "java.io.OutputStream")) {
          return this["withOut(Ljava.io.OutputStream;Lscala.Function0;)O"](arg$1, arg$2)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.setErr = (function(arg$1) {
      if ($.isInstance(arg$1, "java.io.PrintStream")) {
        return this["setErr(Ljava.io.PrintStream;)V"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.io.OutputStream")) {
          return this["setErr(Ljava.io.OutputStream;)V"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.withErr = (function(arg$1, arg$2) {
      if ($.isInstance(arg$1, "java.io.PrintStream")) {
        return this["withErr(Ljava.io.PrintStream;Lscala.Function0;)O"](arg$1, arg$2)
      } else {
        if ($.isInstance(arg$1, "java.io.OutputStream")) {
          return this["withErr(Ljava.io.OutputStream;Lscala.Function0;)O"](arg$1, arg$2)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.setIn = (function(arg$1) {
      if ($.isInstance(arg$1, "java.io.Reader")) {
        return this["setIn(Ljava.io.Reader;)V"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.io.InputStream")) {
          return this["setIn(Ljava.io.InputStream;)V"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.withIn = (function(arg$1, arg$2) {
      if ($.isInstance(arg$1, "java.io.Reader")) {
        return this["withIn(Ljava.io.Reader;Lscala.Function0;)O"](arg$1, arg$2)
      } else {
        if ($.isInstance(arg$1, "java.io.InputStream")) {
          return this["withIn(Ljava.io.InputStream;Lscala.Function0;)O"](arg$1, arg$2)
        } else {
          throw "No matching overload"
        }
      }
    });
    Class.prototype.print = (function(arg$1) {
      return this["print(O)V"](arg$1)
    });
    Class.prototype.flush = (function() {
      return this["flush()V"]()
    });
    Class.prototype.println = (function(arg$1) {
      switch (arguments.length) {
        case 0:
          return this["println()V"]();
        case 1:
          return this["println(O)V"](arg$1);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.printf = (function(arg$1, arg$2) {
      return this["printf(TLscala.collection.Seq;)V"](arg$1, arg$2)
    });
    Class.prototype.readLine = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 0:
          return this["readLine()T"]();
        case 2:
          return this["readLine(TLscala.collection.Seq;)T"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.readBoolean = (function() {
      return this["readBoolean()Z"]()
    });
    Class.prototype.readByte = (function() {
      return this["readByte()B"]()
    });
    Class.prototype.readShort = (function() {
      return this["readShort()S"]()
    });
    Class.prototype.readChar = (function() {
      return this["readChar()C"]()
    });
    Class.prototype.readInt = (function() {
      return this["readInt()I"]()
    });
    Class.prototype.readLong = (function() {
      return this["readLong()J"]()
    });
    Class.prototype.readFloat = (function() {
      return this["readFloat()F"]()
    });
    Class.prototype.readDouble = (function() {
      return this["readDouble()D"]()
    });
    Class.prototype.readf = (function(arg$1) {
      return this["readf(T)Lscala.collection.immutable.List;"](arg$1)
    });
    Class.prototype.readf1 = (function(arg$1) {
      return this["readf1(T)O"](arg$1)
    });
    Class.prototype.readf2 = (function(arg$1) {
      return this["readf2(T)Lscala.Tuple2;"](arg$1)
    });
    Class.prototype.readf3 = (function(arg$1) {
      return this["readf3(T)Lscala.Tuple3;"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.Console$", Class, JSClass, "java.lang.Object", {
      "scala.Console$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.Console", "scala.Console$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.compat.Platform$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$EOL = null
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["arraycopy(OIOII)V"] = (function(arg$src, arg$srcPos, arg$dest, arg$destPos, arg$length) {
      $.m["java.lang.System"]["arraycopy(OIOII)V"](arg$src, arg$srcPos, arg$dest, arg$destPos, arg$length)
    });
    Class.prototype["createArray(Ljava.lang.Class;I)O"] = (function(arg$elemClass, arg$length) {
      return $.m["java.lang.reflect.Array"]["newInstance(Ljava.lang.Class;I)O"](arg$elemClass, arg$length)
    });
    Class.prototype["arrayclear([I)V"] = (function(arg$arr) {
      $.m["java.util.Arrays"]["fill([II)V"](arg$arr, 0)
    });
    Class.prototype["getClassForName(T)Ljava.lang.Class;"] = (function(arg$name) {
      return $.m["java.lang.Class"]["forName(T)Ljava.lang.Class;"](arg$name)
    });
    Class.prototype["EOL()T"] = (function() {
      return this.$jsfield$EOL
    });
    Class.prototype["currentTime()J"] = (function() {
      return $.m["java.lang.System"]["currentTimeMillis()J"]()
    });
    Class.prototype["collectGarbage()V"] = (function() {
      $.m["java.lang.System"]["gc()V"]()
    });
    Class.prototype["defaultCharsetName()T"] = (function() {
      return $.m["java.nio.charset.Charset"]["defaultCharset()Ljava.nio.charset.Charset;"]()["name()T"]()
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.compat.Platform"]._instance = this;
      this.$jsfield$EOL = "\n";
      return this
    });
    Class.prototype.arraycopy = (function(arg$1, arg$2, arg$3, arg$4, arg$5) {
      return this["arraycopy(OIOII)V"](arg$1, arg$2, arg$3, arg$4, arg$5)
    });
    Class.prototype.createArray = (function(arg$1, arg$2) {
      return this["createArray(Ljava.lang.Class;I)O"](arg$1, arg$2)
    });
    Class.prototype.arrayclear = (function(arg$1) {
      return this["arrayclear([I)V"](arg$1)
    });
    Class.prototype.getClassForName = (function(arg$1) {
      return this["getClassForName(T)Ljava.lang.Class;"](arg$1)
    });
    Class.prototype.EOL = (function() {
      return this["EOL()T"]()
    });
    Class.prototype.currentTime = (function() {
      return this["currentTime()J"]()
    });
    Class.prototype.collectGarbage = (function() {
      return this["collectGarbage()V"]()
    });
    Class.prototype.defaultCharsetName = (function() {
      return this["defaultCharsetName()T"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.compat.Platform$", Class, JSClass, "java.lang.Object", {
      "scala.compat.Platform$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.compat.Platform", "scala.compat.Platform$")
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Any", {
    "scala.js.Any": true,
    "java.lang.Object": true
  });
  $.registerClass("scala.js.Any$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["fromArray(O)Lscala.js.Array;"] = (function(arg$array) {
      var length$jsid$37017 = $.m["scala.runtime.ScalaRunTime"]["array_length(O)I"](arg$array);
      var result$jsid$37018 = new $.g.Array(length$jsid$37017);
      var i$jsid$37019 = 0;
      while ((i$jsid$37019 < length$jsid$37017)) {
        result$jsid$37018[i$jsid$37019] = $.m["scala.runtime.ScalaRunTime"]["array_apply(OI)O"](arg$array, i$jsid$37019);
        i$jsid$37019 = (i$jsid$37019 + 1)
      };
      return result$jsid$37018
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Any"]._instance = this;
      return this
    });
    Class.prototype.fromArray = (function(arg$1) {
      return this["fromArray(O)Lscala.js.Array;"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Any$", Class, JSClass, "java.lang.Object", {
      "scala.js.Any$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Any", "scala.js.Any$");
  $.registerClass("scala.js.Any$class", (function($) {
    var Class = undefined;
    var JSClass = undefined;
    $.createClass("scala.js.Any$class", Class, JSClass, "java.lang.Object", {
      "scala.js.Any$class": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.js.package$", (function($) {
    var Class = undefined;
    var JSClass = undefined;
    $.createClass("scala.js.package$", Class, JSClass, "scala.js.Object", {
      "scala.js.package$": true,
      "scala.js.GlobalScope": true,
      "scala.js.Object": true,
      "scala.js.Any": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.String", {
    "scala.js.String": true,
    "scala.js.Any": true,
    "java.lang.Object": true
  });
  $.registerClass("scala.js.String$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.String"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.String$", Class, JSClass, "java.lang.Object", {
      "scala.js.String$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.String", "scala.js.String$");
  $.registerClass("scala.js.String$class", (function($) {
    var Class = undefined;
    var JSClass = undefined;
    $.createClass("scala.js.String$class", Class, JSClass, "java.lang.Object", {
      "scala.js.String$class": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.js.Object", (function($) {
    var Class = undefined;
    var JSClass = undefined;
    $.createClass("scala.js.Object", Class, JSClass, "java.lang.Object", {
      "scala.js.Object": true,
      "scala.js.Any": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Boolean", {
    "scala.js.Boolean": true,
    "scala.js.Any": true,
    "java.lang.Object": true
  });
  $.registerClass("scala.js.Boolean$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Boolean"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Boolean$", Class, JSClass, "java.lang.Object", {
      "scala.js.Boolean$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Boolean", "scala.js.Boolean$")
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.GlobalScope", {
    "scala.js.GlobalScope": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Dictionary", {
    "scala.js.Dictionary": true,
    "scala.js.Any": true,
    "java.lang.Object": true
  });
  $.registerClass("scala.js.Dictionary$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["empty()Lscala.js.Dictionary;"] = (function() {
      return this["fromAny(Lscala.js.Any;)Lscala.js.Dictionary;"]({
        
      })
    });
    Class.prototype["apply(Lscala.collection.Seq;)Lscala.js.Dictionary;"] = (function(arg$properties) {
      return this["apply(Lscala.collection.TraversableOnce;)Lscala.js.Dictionary;"](arg$properties)
    });
    Class.prototype["apply(Lscala.collection.TraversableOnce;)Lscala.js.Dictionary;"] = (function(arg$properties) {
      var result$jsid$37216 = this["empty()Lscala.js.Dictionary;"]();
      var jsx$3 = $.m["scala.collection.TraversableOnce"]["MonadOps(Lscala.collection.TraversableOnce;)Lscala.collection.TraversableOnce$MonadOps;"](arg$properties);
      var jsx$4 = new $.c["scala.js.Dictionary$$anonfun$apply$1"]()["<init>()"]();
      var jsx$1 = jsx$3["withFilter(Lscala.Function1;)Lscala.collection.Iterator;"](jsx$4);
      var jsx$2 = new $.c["scala.js.Dictionary$$anonfun$apply$2"]()["<init>(Lscala.js.Dictionary;)"](result$jsid$37216);
      jsx$1["foreach(Lscala.Function1;)V"](jsx$2);
      return result$jsid$37216
    });
    Class.prototype["apply(Lscala.collection.Seq;Lscala.Function1;Lscala.Function1;)Lscala.js.Dictionary;"] = (function(arg$properties, arg$evidence$1, arg$evidence$2) {
      return this["apply(Lscala.collection.TraversableOnce;Lscala.Function1;Lscala.Function1;)Lscala.js.Dictionary;"](arg$properties, arg$evidence$1, arg$evidence$2)
    });
    Class.prototype["apply(Lscala.collection.TraversableOnce;Lscala.Function1;Lscala.Function1;)Lscala.js.Dictionary;"] = (function(arg$properties, arg$evidence$3, arg$evidence$4) {
      var result$jsid$37525 = this["empty()Lscala.js.Dictionary;"]();
      var jsx$7 = $.m["scala.collection.TraversableOnce"]["MonadOps(Lscala.collection.TraversableOnce;)Lscala.collection.TraversableOnce$MonadOps;"](arg$properties);
      var jsx$8 = new $.c["scala.js.Dictionary$$anonfun$apply$3"]()["<init>()"]();
      var jsx$5 = jsx$7["withFilter(Lscala.Function1;)Lscala.collection.Iterator;"](jsx$8);
      var jsx$6 = new $.c["scala.js.Dictionary$$anonfun$apply$4"]()["<init>(Lscala.Function1;Lscala.Function1;Lscala.js.Dictionary;)"](arg$evidence$3, arg$evidence$4, result$jsid$37525);
      jsx$5["foreach(Lscala.Function1;)V"](jsx$6);
      return result$jsid$37525
    });
    Class.prototype["fromAny(Lscala.js.Any;)Lscala.js.Dictionary;"] = (function(arg$value) {
      return arg$value
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Dictionary"]._instance = this;
      return this
    });
    Class.prototype.empty = (function() {
      return this["empty()Lscala.js.Dictionary;"]()
    });
    Class.prototype.apply = (function(arg$1, arg$2, arg$3) {
      switch (arguments.length) {
        case 1:
          if ($.isInstance(arg$1, "scala.collection.Seq")) {
            return this["apply(Lscala.collection.Seq;)Lscala.js.Dictionary;"](arg$1)
          } else {
            if ($.isInstance(arg$1, "scala.collection.TraversableOnce")) {
              return this["apply(Lscala.collection.TraversableOnce;)Lscala.js.Dictionary;"](arg$1)
            } else {
              throw "No matching overload"
            }
          };
        case 3:
          if ($.isInstance(arg$1, "scala.collection.Seq")) {
            return this["apply(Lscala.collection.Seq;Lscala.Function1;Lscala.Function1;)Lscala.js.Dictionary;"](arg$1, arg$2, arg$3)
          } else {
            if ($.isInstance(arg$1, "scala.collection.TraversableOnce")) {
              return this["apply(Lscala.collection.TraversableOnce;Lscala.Function1;Lscala.Function1;)Lscala.js.Dictionary;"](arg$1, arg$2, arg$3)
            } else {
              throw "No matching overload"
            }
          };
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.fromAny = (function(arg$1) {
      return this["fromAny(Lscala.js.Any;)Lscala.js.Dictionary;"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Dictionary$", Class, JSClass, "java.lang.Object", {
      "scala.js.Dictionary$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Dictionary", "scala.js.Dictionary$");
  $.registerClass("scala.js.Dictionary$$anonfun$apply$1", (function($) {
    function Class() {
      $.c["scala.runtime.AbstractFunction1"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["scala.runtime.AbstractFunction1"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(Lscala.Tuple2;)Z"] = (function(arg$check$ifrefutable$1) {
      var x1$jsid$38374 = arg$check$ifrefutable$1;
      var result$$jslabel$matchEnd3$38377;
      $jslabel$matchEnd3$38377: do {
        if ((x1$jsid$38374 !== null)) {
          result$$jslabel$matchEnd3$38377 = true;
          break $jslabel$matchEnd3$38377
        } else {
          /*<skip>*/
        };
        result$$jslabel$matchEnd3$38377 = false;
        break $jslabel$matchEnd3$38377
      } while (false);
      return result$$jslabel$matchEnd3$38377
    });
    Class.prototype["apply(O)O"] = (function(arg$v1) {
      return $.bZ(this["apply(Lscala.Tuple2;)Z"]($.asInstance(arg$v1, "scala.Tuple2")))
    });
    Class.prototype["<init>()"] = (function() {
      $.c["scala.runtime.AbstractFunction1"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1) {
      if ($.isInstance(arg$1, "scala.Tuple2")) {
        return this["apply(Lscala.Tuple2;)Z"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.lang.Object")) {
          return this["apply(O)O"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Dictionary$$anonfun$apply$1", Class, JSClass, "scala.runtime.AbstractFunction1", {
      "scala.js.Dictionary$$anonfun$apply$1": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.runtime.AbstractFunction1": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.js.Dictionary$$anonfun$apply$2", (function($) {
    function Class() {
      $.c["scala.runtime.AbstractFunction1"].prototype.constructor.call(this);
      this.$jsfield$result$1 = null
    };
    Class.prototype = Object.create($.c["scala.runtime.AbstractFunction1"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(Lscala.Tuple2;)V"] = (function(arg$x$1) {
      var x1$jsid$38382 = arg$x$1;
      $jslabel$matchEnd3$38384: do {
        if ((x1$jsid$38382 !== null)) {
          var key$jsid$37262 = x1$jsid$38382["_1()O"]();
          var value$jsid$37263 = x1$jsid$38382["_2()O"]();
          this.$jsfield$result$1[key$jsid$37262] = value$jsid$37263;
          $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
          break $jslabel$matchEnd3$38384
        } else {
          /*<skip>*/
        };
        throw new $.c["scala.MatchError"]()["<init>(O)"](x1$jsid$38382);
        break $jslabel$matchEnd3$38384
      } while (false)
    });
    Class.prototype["apply(O)O"] = (function(arg$v1) {
      this["apply(Lscala.Tuple2;)V"]($.asInstance(arg$v1, "scala.Tuple2"));
      return $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]()
    });
    Class.prototype["<init>(Lscala.js.Dictionary;)"] = (function(arg$result$1) {
      this.$jsfield$result$1 = arg$result$1;
      $.c["scala.runtime.AbstractFunction1"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1) {
      if ($.isInstance(arg$1, "scala.Tuple2")) {
        return this["apply(Lscala.Tuple2;)V"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.lang.Object")) {
          return this["apply(O)O"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    function JSClass(arg$1) {
      Class.call(this);
      return this["<init>(Lscala.js.Dictionary;)"](arg$1)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Dictionary$$anonfun$apply$2", Class, JSClass, "scala.runtime.AbstractFunction1", {
      "scala.js.Dictionary$$anonfun$apply$2": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.runtime.AbstractFunction1": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.js.Dictionary$$anonfun$apply$3", (function($) {
    function Class() {
      $.c["scala.runtime.AbstractFunction1"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["scala.runtime.AbstractFunction1"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(Lscala.Tuple2;)Z"] = (function(arg$check$ifrefutable$2) {
      var x1$jsid$38388 = arg$check$ifrefutable$2;
      var result$$jslabel$matchEnd3$38390;
      $jslabel$matchEnd3$38390: do {
        if ((x1$jsid$38388 !== null)) {
          result$$jslabel$matchEnd3$38390 = true;
          break $jslabel$matchEnd3$38390
        } else {
          /*<skip>*/
        };
        result$$jslabel$matchEnd3$38390 = false;
        break $jslabel$matchEnd3$38390
      } while (false);
      return result$$jslabel$matchEnd3$38390
    });
    Class.prototype["apply(O)O"] = (function(arg$v1) {
      return $.bZ(this["apply(Lscala.Tuple2;)Z"]($.asInstance(arg$v1, "scala.Tuple2")))
    });
    Class.prototype["<init>()"] = (function() {
      $.c["scala.runtime.AbstractFunction1"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1) {
      if ($.isInstance(arg$1, "scala.Tuple2")) {
        return this["apply(Lscala.Tuple2;)Z"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.lang.Object")) {
          return this["apply(O)O"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Dictionary$$anonfun$apply$3", Class, JSClass, "scala.runtime.AbstractFunction1", {
      "scala.js.Dictionary$$anonfun$apply$3": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.runtime.AbstractFunction1": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.js.Dictionary$$anonfun$apply$4", (function($) {
    function Class() {
      $.c["scala.runtime.AbstractFunction1"].prototype.constructor.call(this);
      this.$jsfield$evidence$3$1 = null;
      this.$jsfield$evidence$4$1 = null;
      this.$jsfield$result$2 = null
    };
    Class.prototype = Object.create($.c["scala.runtime.AbstractFunction1"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["apply(Lscala.Tuple2;)V"] = (function(arg$x$2) {
      var x1$jsid$38395 = arg$x$2;
      $jslabel$matchEnd3$38397: do {
        if ((x1$jsid$38395 !== null)) {
          var key$jsid$37569 = x1$jsid$38395["_1()O"]();
          var value$jsid$37570 = x1$jsid$38395["_2()O"]();
          this.$jsfield$result$2[this.$jsfield$evidence$3$1["apply(O)O"](key$jsid$37569)] = this.$jsfield$evidence$4$1["apply(O)O"](value$jsid$37570);
          $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]();
          break $jslabel$matchEnd3$38397
        } else {
          /*<skip>*/
        };
        throw new $.c["scala.MatchError"]()["<init>(O)"](x1$jsid$38395);
        break $jslabel$matchEnd3$38397
      } while (false)
    });
    Class.prototype["apply(O)O"] = (function(arg$v1) {
      this["apply(Lscala.Tuple2;)V"]($.asInstance(arg$v1, "scala.Tuple2"));
      return $.m["scala.runtime.BoxedUnit"]["UNIT()Lscala.runtime.BoxedUnit;"]()
    });
    Class.prototype["<init>(Lscala.Function1;Lscala.Function1;Lscala.js.Dictionary;)"] = (function(arg$evidence$3$1, arg$evidence$4$1, arg$result$2) {
      this.$jsfield$evidence$3$1 = arg$evidence$3$1;
      this.$jsfield$evidence$4$1 = arg$evidence$4$1;
      this.$jsfield$result$2 = arg$result$2;
      $.c["scala.runtime.AbstractFunction1"].prototype["<init>()"].call(this);
      return this
    });
    Class.prototype.apply = (function(arg$1) {
      if ($.isInstance(arg$1, "scala.Tuple2")) {
        return this["apply(Lscala.Tuple2;)V"](arg$1)
      } else {
        if ($.isInstance(arg$1, "java.lang.Object")) {
          return this["apply(O)O"](arg$1)
        } else {
          throw "No matching overload"
        }
      }
    });
    function JSClass(arg$1, arg$2, arg$3) {
      Class.call(this);
      return this["<init>(Lscala.Function1;Lscala.Function1;Lscala.js.Dictionary;)"](arg$1, arg$2, arg$3)
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Dictionary$$anonfun$apply$4", Class, JSClass, "scala.runtime.AbstractFunction1", {
      "scala.js.Dictionary$$anonfun$apply$4": true,
      "scala.Serializable": true,
      "java.io.Serializable": true,
      "scala.runtime.AbstractFunction1": true,
      "scala.Function1": true,
      "java.lang.Object": true
    })
  }))
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Number", {
    "scala.js.Number": true,
    "scala.js.Any": true,
    "java.lang.Object": true
  });
  $.registerClass("scala.js.Number$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Number"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Number$", Class, JSClass, "java.lang.Object", {
      "scala.js.Number$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Number", "scala.js.Number$")
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.js.Array", (function($) {
    var Class = undefined;
    var JSClass = undefined;
    $.createClass("scala.js.Array", Class, JSClass, "scala.js.Object", {
      "scala.js.Array": true,
      "scala.js.Object": true,
      "scala.js.Any": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.js.Array$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["toArray(Lscala.js.Array;Lscala.reflect.ClassTag;)O"] = (function(arg$array, arg$evidence$5) {
      var length$jsid$37695 = (arg$array.length | 0);
      var result$jsid$37696 = arg$evidence$5["newArray(I)O"](length$jsid$37695);
      var i$jsid$37697 = 0;
      while ((i$jsid$37697 < length$jsid$37695)) {
        $.m["scala.runtime.ScalaRunTime"]["array_update(OIO)V"](result$jsid$37696, i$jsid$37697, arg$array[i$jsid$37697]);
        i$jsid$37697 = (i$jsid$37697 + 1)
      };
      return result$jsid$37696
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Array"]._instance = this;
      return this
    });
    Class.prototype.toArray = (function(arg$1, arg$2) {
      return this["toArray(Lscala.js.Array;Lscala.reflect.ClassTag;)O"](arg$1, arg$2)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Array$", Class, JSClass, "java.lang.Object", {
      "scala.js.Array$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Array", "scala.js.Array$")
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Function1", {
    "scala.js.Function1": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Undefined", {
    "scala.js.Undefined": true,
    "scala.js.Any": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Dynamic", {
    "scala.js.Dynamic": true,
    "scala.Dynamic": true,
    "scala.js.Any": true,
    "java.lang.Object": true
  });
  $.registerClass("scala.js.Dynamic$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Dynamic"]._instance = this;
      return this
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Dynamic$", Class, JSClass, "java.lang.Object", {
      "scala.js.Dynamic$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Dynamic", "scala.js.Dynamic$")
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Function2", {
    "scala.js.Function2": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.js.Date", (function($) {
    var Class = undefined;
    var JSClass = undefined;
    $.createClass("scala.js.Date", Class, JSClass, "scala.js.Object", {
      "scala.js.Date": true,
      "scala.js.Object": true,
      "scala.js.Any": true,
      "java.lang.Object": true
    })
  }));
  $.registerClass("scala.js.Date$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["<init>$default$3()Lscala.js.Number;"] = (function() {
      return 1
    });
    Class.prototype["<init>$default$4()Lscala.js.Number;"] = (function() {
      return 0
    });
    Class.prototype["<init>$default$5()Lscala.js.Number;"] = (function() {
      return 0
    });
    Class.prototype["<init>$default$6()Lscala.js.Number;"] = (function() {
      return 0
    });
    Class.prototype["<init>$default$7()Lscala.js.Number;"] = (function() {
      return 0
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.js.Date"]._instance = this;
      return this
    });
    Class.prototype["<init>$default$3"] = (function() {
      return this["<init>$default$3()Lscala.js.Number;"]()
    });
    Class.prototype["<init>$default$4"] = (function() {
      return this["<init>$default$4()Lscala.js.Number;"]()
    });
    Class.prototype["<init>$default$5"] = (function() {
      return this["<init>$default$5()Lscala.js.Number;"]()
    });
    Class.prototype["<init>$default$6"] = (function() {
      return this["<init>$default$6()Lscala.js.Number;"]()
    });
    Class.prototype["<init>$default$7"] = (function() {
      return this["<init>$default$7()Lscala.js.Number;"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.js.Date$", Class, JSClass, "java.lang.Object", {
      "scala.js.Date$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.js.Date", "scala.js.Date$")
})($ScalaJSEnvironment);

(function($) {
  $.createInterface("scala.js.Function0", {
    "scala.js.Function0": true,
    "java.lang.Object": true
  })
})($ScalaJSEnvironment);

(function($) {
  $.registerClass("scala.runtime.BoxesRunTime$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this)
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["boxToBoolean(Z)Ljava.lang.Boolean;"] = (function(arg$b) {
      return $.m["java.lang.Boolean"]["valueOf(Z)Ljava.lang.Boolean;"](arg$b)
    });
    Class.prototype["boxToCharacter(C)Ljava.lang.Character;"] = (function(arg$c) {
      return $.m["java.lang.Character"]["valueOf(C)Ljava.lang.Character;"](arg$c)
    });
    Class.prototype["boxToByte(B)Ljava.lang.Byte;"] = (function(arg$b) {
      return $.m["java.lang.Byte"]["valueOf(B)Ljava.lang.Byte;"](arg$b)
    });
    Class.prototype["boxToShort(S)Ljava.lang.Short;"] = (function(arg$s) {
      return $.m["java.lang.Short"]["valueOf(S)Ljava.lang.Short;"](arg$s)
    });
    Class.prototype["boxToInteger(I)Ljava.lang.Integer;"] = (function(arg$i) {
      return $.m["java.lang.Integer"]["valueOf(I)Ljava.lang.Integer;"](arg$i)
    });
    Class.prototype["boxToLong(J)Ljava.lang.Long;"] = (function(arg$l) {
      return $.m["java.lang.Long"]["valueOf(J)Ljava.lang.Long;"](arg$l)
    });
    Class.prototype["boxToFloat(F)Ljava.lang.Float;"] = (function(arg$f) {
      return $.m["java.lang.Float"]["valueOf(F)Ljava.lang.Float;"](arg$f)
    });
    Class.prototype["boxToDouble(D)Ljava.lang.Double;"] = (function(arg$d) {
      return $.m["java.lang.Double"]["valueOf(D)Ljava.lang.Double;"](arg$d)
    });
    Class.prototype["unboxToBoolean(O)Z"] = (function(arg$b) {
      if ((arg$b === null)) {
        return false
      } else {
        return $.asInstance(arg$b, "java.lang.Boolean")["booleanValue()Z"]()
      }
    });
    Class.prototype["unboxToChar(O)C"] = (function(arg$c) {
      if ((arg$c === null)) {
        return 0
      } else {
        return $.asInstance(arg$c, "java.lang.Character")["charValue()C"]()
      }
    });
    Class.prototype["unboxToByte(O)B"] = (function(arg$b) {
      if ((arg$b === null)) {
        return 0
      } else {
        return $.asInstance(arg$b, "java.lang.Byte")["byteValue()B"]()
      }
    });
    Class.prototype["unboxToShort(O)S"] = (function(arg$s) {
      if ((arg$s === null)) {
        return 0
      } else {
        return $.asInstance(arg$s, "java.lang.Short")["shortValue()S"]()
      }
    });
    Class.prototype["unboxToInt(O)I"] = (function(arg$i) {
      if ((arg$i === null)) {
        return 0
      } else {
        return $.asInstance(arg$i, "java.lang.Integer")["intValue()I"]()
      }
    });
    Class.prototype["unboxToLong(O)J"] = (function(arg$l) {
      if ((arg$l === null)) {
        return 0
      } else {
        return $.asInstance(arg$l, "java.lang.Long")["longValue()J"]()
      }
    });
    Class.prototype["unboxToFloat(O)F"] = (function(arg$f) {
      if ((arg$f === null)) {
        return 0.0
      } else {
        return $.asInstance(arg$f, "java.lang.Float")["floatValue()F"]()
      }
    });
    Class.prototype["unboxToDouble(O)D"] = (function(arg$d) {
      if ((arg$d === null)) {
        return 0.0
      } else {
        return $.asInstance(arg$d, "java.lang.Double")["doubleValue()D"]()
      }
    });
    Class.prototype["equals(OO)Z"] = (function(arg$x, arg$y) {
      if ((arg$x === arg$y)) {
        return true
      } else {
        return this["equals2(OO)Z"](arg$x, arg$y)
      }
    });
    Class.prototype["equals2(OO)Z"] = (function(arg$x, arg$y) {
      var x1$jsid$38404 = arg$x;
      var result$$jslabel$matchEnd5$38408;
      $jslabel$matchEnd5$38408: do {
        if ($.isInstance(x1$jsid$38404, "java.lang.Number")) {
          var x2$jsid$38405 = $.asInstance(x1$jsid$38404, "java.lang.Number");
          result$$jslabel$matchEnd5$38408 = this["equalsNumObject(Ljava.lang.Number;O)Z"](x2$jsid$38405, arg$y);
          break $jslabel$matchEnd5$38408
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38404, "java.lang.Character")) {
          var x3$jsid$38406 = $.asInstance(x1$jsid$38404, "java.lang.Character");
          result$$jslabel$matchEnd5$38408 = this["equalsCharObject(Ljava.lang.Character;O)Z"](x3$jsid$38406, arg$y);
          break $jslabel$matchEnd5$38408
        } else {
          /*<skip>*/
        };
        if ((x1$jsid$38404 === null)) {
          result$$jslabel$matchEnd5$38408 = (arg$y === null)
        } else {
          result$$jslabel$matchEnd5$38408 = $.objectEquals(x1$jsid$38404, arg$y)
        };
        break $jslabel$matchEnd5$38408
      } while (false);
      return result$$jslabel$matchEnd5$38408
    });
    Class.prototype["equalsNumObject(Ljava.lang.Number;O)Z"] = (function(arg$xn, arg$y) {
      var x1$jsid$38414 = arg$y;
      var result$$jslabel$matchEnd5$38418;
      $jslabel$matchEnd5$38418: do {
        if ($.isInstance(x1$jsid$38414, "java.lang.Number")) {
          var x2$jsid$38415 = $.asInstance(x1$jsid$38414, "java.lang.Number");
          result$$jslabel$matchEnd5$38418 = this["equalsNumNum(Ljava.lang.Number;Ljava.lang.Number;)Z"](arg$xn, x2$jsid$38415);
          break $jslabel$matchEnd5$38418
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38414, "java.lang.Character")) {
          var x3$jsid$38416 = $.asInstance(x1$jsid$38414, "java.lang.Character");
          result$$jslabel$matchEnd5$38418 = this["equalsNumChar(Ljava.lang.Number;Ljava.lang.Character;)Z"](arg$xn, x3$jsid$38416);
          break $jslabel$matchEnd5$38418
        } else {
          /*<skip>*/
        };
        if ((arg$xn === null)) {
          result$$jslabel$matchEnd5$38418 = (x1$jsid$38414 === null)
        } else {
          result$$jslabel$matchEnd5$38418 = $.objectEquals(arg$xn, x1$jsid$38414)
        };
        break $jslabel$matchEnd5$38418
      } while (false);
      return result$$jslabel$matchEnd5$38418
    });
    Class.prototype["typeCode(O)I"] = (function(arg$a) {
      var x1$jsid$38424 = arg$a;
      var result$$jslabel$matchEnd10$38433;
      $jslabel$matchEnd10$38433: do {
        if ($.isInstance(x1$jsid$38424, "java.lang.Integer")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["INT()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38424, "java.lang.Byte")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["BYTE()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38424, "java.lang.Character")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["CHAR()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38424, "java.lang.Long")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["LONG()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38424, "java.lang.Double")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["DOUBLE()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38424, "java.lang.Short")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["SHORT()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38424, "java.lang.Float")) {
          result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["FLOAT()I"]();
          break $jslabel$matchEnd10$38433
        } else {
          /*<skip>*/
        };
        result$$jslabel$matchEnd10$38433 = $.m["scala.runtime.BoxesRunTime$Codes"]["OTHER()I"]();
        break $jslabel$matchEnd10$38433
      } while (false);
      return result$$jslabel$matchEnd10$38433
    });
    Class.prototype["eqTypeCode(Ljava.lang.Number;)I"] = (function(arg$a) {
      var x1$jsid$38444 = arg$a;
      var result$$jslabel$matchEnd9$38452;
      $jslabel$matchEnd9$38452: do {
        if ($.isInstance(x1$jsid$38444, "java.lang.Integer")) {
          result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["INT()I"]();
          break $jslabel$matchEnd9$38452
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38444, "java.lang.Byte")) {
          result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["INT()I"]();
          break $jslabel$matchEnd9$38452
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38444, "java.lang.Long")) {
          result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["LONG()I"]();
          break $jslabel$matchEnd9$38452
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38444, "java.lang.Double")) {
          result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["DOUBLE()I"]();
          break $jslabel$matchEnd9$38452
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38444, "java.lang.Short")) {
          result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["INT()I"]();
          break $jslabel$matchEnd9$38452
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38444, "java.lang.Float")) {
          result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["FLOAT()I"]();
          break $jslabel$matchEnd9$38452
        } else {
          /*<skip>*/
        };
        result$$jslabel$matchEnd9$38452 = $.m["scala.runtime.BoxesRunTime$Codes"]["OTHER()I"]();
        break $jslabel$matchEnd9$38452
      } while (false);
      return result$$jslabel$matchEnd9$38452
    });
    Class.prototype["equalsNumNum(Ljava.lang.Number;Ljava.lang.Number;)Z"] = (function(arg$xn, arg$yn) {
      var xcode$jsid$37946 = this["eqTypeCode(Ljava.lang.Number;)I"](arg$xn);
      var ycode$jsid$37947 = this["eqTypeCode(Ljava.lang.Number;)I"](arg$yn);
      if ((ycode$jsid$37947 > xcode$jsid$37946)) {
        var dcode$jsid$37948 = ycode$jsid$37947
      } else {
        var dcode$jsid$37948 = xcode$jsid$37946
      };
      var x1$jsid$38462 = dcode$jsid$37948;
      switch (x1$jsid$38462) {
        default:
          if ((x1$jsid$38462 === $.m["scala.runtime.BoxesRunTime$Codes"]["INT()I"]())) {
            return (arg$xn["intValue()I"]() === arg$yn["intValue()I"]())
          } else {
            if ((x1$jsid$38462 === $.m["scala.runtime.BoxesRunTime$Codes"]["LONG()I"]())) {
              return (arg$xn["longValue()J"]() === arg$yn["longValue()J"]())
            } else {
              if ((x1$jsid$38462 === $.m["scala.runtime.BoxesRunTime$Codes"]["FLOAT()I"]())) {
                return (arg$xn["floatValue()F"]() === arg$yn["floatValue()F"]())
              } else {
                if ((x1$jsid$38462 === $.m["scala.runtime.BoxesRunTime$Codes"]["DOUBLE()I"]())) {
                  return (arg$xn["doubleValue()D"]() === arg$yn["doubleValue()D"]())
                } else {
                  if (($.isInstance(arg$yn, "scala.math.ScalaNumber") && (!$.isInstance(arg$xn, "scala.math.ScalaNumber")))) {
                    return $.objectEquals(arg$yn, arg$xn)
                  } else {
                    if ((arg$xn === null)) {
                      return (arg$yn === null)
                    } else {
                      return $.objectEquals(arg$xn, arg$yn)
                    }
                  }
                }
              }
            }
          };
      }
    });
    Class.prototype["equalsCharObject(Ljava.lang.Character;O)Z"] = (function(arg$xc, arg$y) {
      var x1$jsid$38464 = arg$y;
      var result$$jslabel$matchEnd5$38468;
      $jslabel$matchEnd5$38468: do {
        if ($.isInstance(x1$jsid$38464, "java.lang.Character")) {
          var x2$jsid$38465 = $.asInstance(x1$jsid$38464, "java.lang.Character");
          result$$jslabel$matchEnd5$38468 = (arg$xc["charValue()C"]() === x2$jsid$38465["charValue()C"]());
          break $jslabel$matchEnd5$38468
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38464, "java.lang.Number")) {
          var x3$jsid$38466 = $.asInstance(x1$jsid$38464, "java.lang.Number");
          result$$jslabel$matchEnd5$38468 = this["equalsNumChar(Ljava.lang.Number;Ljava.lang.Character;)Z"](x3$jsid$38466, arg$xc);
          break $jslabel$matchEnd5$38468
        } else {
          /*<skip>*/
        };
        if ((arg$xc === null)) {
          result$$jslabel$matchEnd5$38468 = (arg$y === null)
        } else {
          result$$jslabel$matchEnd5$38468 = arg$xc["equals(O)Z"](arg$y)
        };
        break $jslabel$matchEnd5$38468
      } while (false);
      return result$$jslabel$matchEnd5$38468
    });
    Class.prototype["equalsNumChar(Ljava.lang.Number;Ljava.lang.Character;)Z"] = (function(arg$xn, arg$yc) {
      var ch$jsid$38004 = arg$yc["charValue()C"]();
      var x1$jsid$38474 = this["eqTypeCode(Ljava.lang.Number;)I"](arg$xn);
      switch (x1$jsid$38474) {
        default:
          if ((x1$jsid$38474 === $.m["scala.runtime.BoxesRunTime$Codes"]["INT()I"]())) {
            return (arg$xn["intValue()I"]() === ch$jsid$38004)
          } else {
            if ((x1$jsid$38474 === $.m["scala.runtime.BoxesRunTime$Codes"]["LONG()I"]())) {
              return (arg$xn["longValue()J"]() === ch$jsid$38004)
            } else {
              if ((x1$jsid$38474 === $.m["scala.runtime.BoxesRunTime$Codes"]["FLOAT()I"]())) {
                return (arg$xn["floatValue()F"]() === ch$jsid$38004)
              } else {
                if ((x1$jsid$38474 === $.m["scala.runtime.BoxesRunTime$Codes"]["DOUBLE()I"]())) {
                  return (arg$xn["doubleValue()D"]() === ch$jsid$38004)
                } else {
                  if ((arg$xn === null)) {
                    return (arg$yc === null)
                  } else {
                    return $.objectEquals(arg$xn, arg$yc)
                  }
                }
              }
            }
          };
      }
    });
    Class.prototype["hashFromLong(Ljava.lang.Long;)I"] = (function(arg$n) {
      var iv$jsid$38046 = arg$n["intValue()I"]();
      if ((iv$jsid$38046 === arg$n["longValue()J"]())) {
        return iv$jsid$38046
      } else {
        return arg$n["hashCode()I"]()
      }
    });
    Class.prototype["hashFromDouble(Ljava.lang.Double;)I"] = (function(arg$n) {
      var iv$jsid$38052 = arg$n["intValue()I"]();
      var dv$jsid$38053 = arg$n["doubleValue()D"]();
      var lv$jsid$38054 = arg$n["longValue()J"]();
      if ((iv$jsid$38052 === dv$jsid$38053)) {
        return iv$jsid$38052
      } else {
        if ((lv$jsid$38054 === dv$jsid$38053)) {
          return $.m["java.lang.Long"]["valueOf(J)Ljava.lang.Long;"](lv$jsid$38054)["hashCode()I"]()
        } else {
          return arg$n["hashCode()I"]()
        }
      }
    });
    Class.prototype["hashFromFloat(Ljava.lang.Float;)I"] = (function(arg$n) {
      var iv$jsid$38069 = arg$n["intValue()I"]();
      var fv$jsid$38070 = arg$n["floatValue()F"]();
      var lv$jsid$38071 = arg$n["longValue()J"]();
      if ((iv$jsid$38069 === fv$jsid$38070)) {
        return iv$jsid$38069
      } else {
        if ((lv$jsid$38071 === fv$jsid$38070)) {
          return $.m["java.lang.Long"]["valueOf(J)Ljava.lang.Long;"](lv$jsid$38071)["hashCode()I"]()
        } else {
          return arg$n["hashCode()I"]()
        }
      }
    });
    Class.prototype["hashFromNumber(Ljava.lang.Number;)I"] = (function(arg$n) {
      var x1$jsid$38476 = arg$n;
      var result$$jslabel$matchEnd6$38481;
      $jslabel$matchEnd6$38481: do {
        if ($.isInstance(x1$jsid$38476, "java.lang.Long")) {
          var x2$jsid$38477 = $.asInstance(x1$jsid$38476, "java.lang.Long");
          result$$jslabel$matchEnd6$38481 = this["hashFromLong(Ljava.lang.Long;)I"](x2$jsid$38477);
          break $jslabel$matchEnd6$38481
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38476, "java.lang.Double")) {
          var x3$jsid$38478 = $.asInstance(x1$jsid$38476, "java.lang.Double");
          result$$jslabel$matchEnd6$38481 = this["hashFromDouble(Ljava.lang.Double;)I"](x3$jsid$38478);
          break $jslabel$matchEnd6$38481
        } else {
          /*<skip>*/
        };
        if ($.isInstance(x1$jsid$38476, "java.lang.Float")) {
          var x4$jsid$38479 = $.asInstance(x1$jsid$38476, "java.lang.Float");
          result$$jslabel$matchEnd6$38481 = this["hashFromFloat(Ljava.lang.Float;)I"](x4$jsid$38479);
          break $jslabel$matchEnd6$38481
        } else {
          /*<skip>*/
        };
        result$$jslabel$matchEnd6$38481 = $.objectHashCode(x1$jsid$38476);
        break $jslabel$matchEnd6$38481
      } while (false);
      return result$$jslabel$matchEnd6$38481
    });
    Class.prototype["hashFromObject(O)I"] = (function(arg$a) {
      var x1$jsid$38488 = arg$a;
      var result$$jslabel$matchEnd4$38491;
      $jslabel$matchEnd4$38491: do {
        if ($.isInstance(x1$jsid$38488, "java.lang.Number")) {
          var x2$jsid$38489 = $.asInstance(x1$jsid$38488, "java.lang.Number");
          result$$jslabel$matchEnd4$38491 = this["hashFromNumber(Ljava.lang.Number;)I"](x2$jsid$38489);
          break $jslabel$matchEnd4$38491
        } else {
          /*<skip>*/
        };
        result$$jslabel$matchEnd4$38491 = $.objectHashCode(x1$jsid$38488);
        break $jslabel$matchEnd4$38491
      } while (false);
      return result$$jslabel$matchEnd4$38491
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      $.modules["scala.runtime.BoxesRunTime"]._instance = this;
      return this
    });
    Class.prototype.boxToBoolean = (function(arg$1) {
      return this["boxToBoolean(Z)Ljava.lang.Boolean;"](arg$1)
    });
    Class.prototype.boxToCharacter = (function(arg$1) {
      return this["boxToCharacter(C)Ljava.lang.Character;"](arg$1)
    });
    Class.prototype.boxToByte = (function(arg$1) {
      return this["boxToByte(B)Ljava.lang.Byte;"](arg$1)
    });
    Class.prototype.boxToShort = (function(arg$1) {
      return this["boxToShort(S)Ljava.lang.Short;"](arg$1)
    });
    Class.prototype.boxToInteger = (function(arg$1) {
      return this["boxToInteger(I)Ljava.lang.Integer;"](arg$1)
    });
    Class.prototype.boxToLong = (function(arg$1) {
      return this["boxToLong(J)Ljava.lang.Long;"](arg$1)
    });
    Class.prototype.boxToFloat = (function(arg$1) {
      return this["boxToFloat(F)Ljava.lang.Float;"](arg$1)
    });
    Class.prototype.boxToDouble = (function(arg$1) {
      return this["boxToDouble(D)Ljava.lang.Double;"](arg$1)
    });
    Class.prototype.unboxToBoolean = (function(arg$1) {
      return this["unboxToBoolean(O)Z"](arg$1)
    });
    Class.prototype.unboxToChar = (function(arg$1) {
      return this["unboxToChar(O)C"](arg$1)
    });
    Class.prototype.unboxToByte = (function(arg$1) {
      return this["unboxToByte(O)B"](arg$1)
    });
    Class.prototype.unboxToShort = (function(arg$1) {
      return this["unboxToShort(O)S"](arg$1)
    });
    Class.prototype.unboxToInt = (function(arg$1) {
      return this["unboxToInt(O)I"](arg$1)
    });
    Class.prototype.unboxToLong = (function(arg$1) {
      return this["unboxToLong(O)J"](arg$1)
    });
    Class.prototype.unboxToFloat = (function(arg$1) {
      return this["unboxToFloat(O)F"](arg$1)
    });
    Class.prototype.unboxToDouble = (function(arg$1) {
      return this["unboxToDouble(O)D"](arg$1)
    });
    Class.prototype.equals = (function(arg$1, arg$2) {
      switch (arguments.length) {
        case 1:
          return this["equals(O)Z"](arg$1);
        case 2:
          return this["equals(OO)Z"](arg$1, arg$2);
        default:
          throw "No matching overload";
      }
    });
    Class.prototype.equals2 = (function(arg$1, arg$2) {
      return this["equals2(OO)Z"](arg$1, arg$2)
    });
    Class.prototype.equalsNumObject = (function(arg$1, arg$2) {
      return this["equalsNumObject(Ljava.lang.Number;O)Z"](arg$1, arg$2)
    });
    Class.prototype.equalsNumNum = (function(arg$1, arg$2) {
      return this["equalsNumNum(Ljava.lang.Number;Ljava.lang.Number;)Z"](arg$1, arg$2)
    });
    Class.prototype.equalsCharObject = (function(arg$1, arg$2) {
      return this["equalsCharObject(Ljava.lang.Character;O)Z"](arg$1, arg$2)
    });
    Class.prototype.hashFromLong = (function(arg$1) {
      return this["hashFromLong(Ljava.lang.Long;)I"](arg$1)
    });
    Class.prototype.hashFromDouble = (function(arg$1) {
      return this["hashFromDouble(Ljava.lang.Double;)I"](arg$1)
    });
    Class.prototype.hashFromFloat = (function(arg$1) {
      return this["hashFromFloat(Ljava.lang.Float;)I"](arg$1)
    });
    Class.prototype.hashFromNumber = (function(arg$1) {
      return this["hashFromNumber(Ljava.lang.Number;)I"](arg$1)
    });
    Class.prototype.hashFromObject = (function(arg$1) {
      return this["hashFromObject(O)I"](arg$1)
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.runtime.BoxesRunTime$", Class, JSClass, "java.lang.Object", {
      "scala.runtime.BoxesRunTime$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.runtime.BoxesRunTime", "scala.runtime.BoxesRunTime$");
  $.registerClass("scala.runtime.BoxesRunTime$Codes$", (function($) {
    function Class() {
      $.c["java.lang.Object"].prototype.constructor.call(this);
      this.$jsfield$CHAR = 0;
      this.$jsfield$BYTE = 0;
      this.$jsfield$SHORT = 0;
      this.$jsfield$INT = 0;
      this.$jsfield$LONG = 0;
      this.$jsfield$FLOAT = 0;
      this.$jsfield$DOUBLE = 0;
      this.$jsfield$OTHER = 0
    };
    Class.prototype = Object.create($.c["java.lang.Object"].prototype);
    Class.prototype.constructor = Class;
    Class.prototype["CHAR()I"] = (function() {
      return this.$jsfield$CHAR
    });
    Class.prototype["BYTE()I"] = (function() {
      return this.$jsfield$BYTE
    });
    Class.prototype["SHORT()I"] = (function() {
      return this.$jsfield$SHORT
    });
    Class.prototype["INT()I"] = (function() {
      return this.$jsfield$INT
    });
    Class.prototype["LONG()I"] = (function() {
      return this.$jsfield$LONG
    });
    Class.prototype["FLOAT()I"] = (function() {
      return this.$jsfield$FLOAT
    });
    Class.prototype["DOUBLE()I"] = (function() {
      return this.$jsfield$DOUBLE
    });
    Class.prototype["OTHER()I"] = (function() {
      return this.$jsfield$OTHER
    });
    Class.prototype["<init>()"] = (function() {
      $.c["java.lang.Object"].prototype["<init>()"].call(this);
      this.$jsfield$CHAR = 0;
      this.$jsfield$BYTE = 1;
      this.$jsfield$SHORT = 2;
      this.$jsfield$INT = 3;
      this.$jsfield$LONG = 4;
      this.$jsfield$FLOAT = 5;
      this.$jsfield$DOUBLE = 6;
      this.$jsfield$OTHER = 7;
      return this
    });
    Class.prototype.CHAR = (function() {
      return this["CHAR()I"]()
    });
    Class.prototype.BYTE = (function() {
      return this["BYTE()I"]()
    });
    Class.prototype.SHORT = (function() {
      return this["SHORT()I"]()
    });
    Class.prototype.INT = (function() {
      return this["INT()I"]()
    });
    Class.prototype.LONG = (function() {
      return this["LONG()I"]()
    });
    Class.prototype.FLOAT = (function() {
      return this["FLOAT()I"]()
    });
    Class.prototype.DOUBLE = (function() {
      return this["DOUBLE()I"]()
    });
    Class.prototype.OTHER = (function() {
      return this["OTHER()I"]()
    });
    function JSClass() {
      Class.call(this);
      return this["<init>()"]()
    };
    JSClass.prototype = Class.prototype;
    $.createClass("scala.runtime.BoxesRunTime$Codes$", Class, JSClass, "java.lang.Object", {
      "scala.runtime.BoxesRunTime$Codes$": true,
      "java.lang.Object": true
    })
  }));
  $.registerModule("scala.runtime.BoxesRunTime$Codes", "scala.runtime.BoxesRunTime$Codes$")
})($ScalaJSEnvironment);


//@ sourceMappingURL=scalajs-runtime.js.map
